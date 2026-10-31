import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { FoundAnimal, FoundClaim } from '../models/foundAnimal.model';
import { Animal } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { User } from '../models/user.model';
import { ensureConversation, postSystemMessage, displayName } from '../utils/chat';
import { normalizeSpecies } from '../utils/species';
import { canReceiveDonations } from '../utils/shelterVerification';
import { sendPushToUser } from '../utils/push';
import { sendEmail } from '../utils/notification';
import logger from '../utils/logger';

// «Lo he encontrado» (ver models/foundAnimal.model.ts). Solo para particulares
// que el admin ha activado (User.rehome), igual que la cesión.

const uid = (req: Request) => String((req as any).user?._id || (req as any).user?.id || '');
const FRONTEND = () => process.env.FRONTEND_URL || 'https://mypetlive.es';
const SPECIES = ['dog', 'cat', 'rabbit', 'bird', 'ferret', 'other'];
// Días con la ficha de «encontrado» publicada antes de poder pedir acogida, para
// dar tiempo a que aparezca su familia. Cifra nuestra: la ley no fija ninguna.
export const FOUND_WAIT_DAYS = 7;
const PUBLIC_STATUSES = ['buscando', 'acogida_pedida'];

async function canRehome(userId: string) {
  const u: any = await User.findById(userId).select('rehome deletedAt').lean();
  return Boolean(u?.rehome?.enabled && !u.deletedAt);
}

function push(userId: string, title: string, body: string, url: string) {
  void sendPushToUser(userId, { title, body, url }).catch(err => logger.error({ err }, '[encontrado] fallo al enviar push'));
}

/** Qué falta para poder pedir acogida (vacío = se puede). */
export function fosterBlockers(f: any, now = Date.now()): string[] {
  const out: string[] = [];
  if (f.chip?.result !== 'none') out.push('chip');
  if (!f.council?.at) out.push('council');
  const ready = new Date(f.publishedAt || f.createdAt).getTime() + FOUND_WAIT_DAYS * 86_400_000;
  if (now < ready) out.push('wait');
  return out;
}

function view(f: any, me?: string) {
  const mine = me && String(f.finderId) === me;
  const readyAt = new Date(new Date(f.publishedAt || f.createdAt).getTime() + FOUND_WAIT_DAYS * 86_400_000);
  const base = {
    _id: String(f._id), name: f.name, species: f.species, sex: f.sex, approxAge: f.approxAge, images: f.images,
    foundAt: f.foundAt, foundPlace: f.foundPlace, city: f.city, description: f.description, status: f.status,
    publishedAt: f.publishedAt, mine: Boolean(mine),
  };
  if (!mine) return base;
  return { ...base, chip: f.chip || null, council: f.council || null, foster: f.foster || null, animalId: f.animalId, readyAt, blockers: fosterBlockers(f) };
}

// GET /api/found — público: animales encontrados que buscan a su familia.
export async function listPublic(req: Request, res: Response) {
  const filter: any = { status: { $in: PUBLIC_STATUSES } };
  if (req.query.species) filter.species = normalizeSpecies(String(req.query.species));
  const items = await FoundAnimal.find(filter).sort({ foundAt: -1 }).limit(100).lean();
  res.json({ items: items.map(f => view(f)) });
}

// GET /api/found/:id — público (sin pasos ni datos de acogida salvo para quien lo encontró).
export async function getOne(req: Request, res: Response) {
  if (!Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const f: any = await FoundAnimal.findById(req.params.id).lean();
  const me = uid(req);
  if (!f || (!PUBLIC_STATUSES.includes(f.status) && String(f.finderId) !== me)) return res.status(404).json({ error: 'not_found' });
  const finder: any = await User.findById(f.finderId).select('name').lean();
  res.json({ ...view(f, me), finderName: finder?.name || 'Particular' });
}

// GET /api/found/mine
export async function listMine(req: Request, res: Response) {
  const me = uid(req);
  const items = await FoundAnimal.find({ finderId: me }).sort({ createdAt: -1 }).lean();
  res.json({ items: items.map(f => view(f, me)) });
}

// POST /api/found
export async function create(req: Request, res: Response) {
  const me = uid(req);
  if (!(await canRehome(me))) return res.status(403).json({ error: 'rehome_not_enabled' });
  const b = req.body || {};
  const species = normalizeSpecies(b.species);
  const foundAt = b.foundAt ? new Date(b.foundAt) : null;
  const foundPlace = typeof b.foundPlace === 'string' ? b.foundPlace.trim().slice(0, 160) : '';
  if (!species || !SPECIES.includes(species)) return res.status(400).json({ error: 'invalid_species' });
  if (!foundAt || Number.isNaN(foundAt.getTime()) || foundAt.getTime() > Date.now() + 60_000) return res.status(400).json({ error: 'invalid_found_date' });
  if (!foundPlace) return res.status(400).json({ error: 'found_place_required' });
  const images = Array.isArray(b.images)
    ? b.images.filter((u: unknown) => typeof u === 'string' && /^(\/uploads\/|https?:\/\/)/.test(u)).slice(0, 8)
    : [];
  if (!images.length) return res.status(400).json({ error: 'photo_required' });
  const f = await FoundAnimal.create({
    finderId: me,
    name: typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 60) : undefined,
    species,
    sex: ['male', 'female'].includes(b.sex) ? b.sex : null,
    approxAge: typeof b.approxAge === 'string' ? b.approxAge.trim().slice(0, 40) : undefined,
    images, foundAt, foundPlace,
    city: typeof b.city === 'string' ? b.city.trim().slice(0, 80) : undefined,
    description: typeof b.description === 'string' ? b.description.trim().slice(0, 2000) : undefined,
    status: 'buscando',
    publishedAt: new Date(),
  });
  res.status(201).json(view(f.toObject(), me));
}

async function own(req: Request) {
  if (!Types.ObjectId.isValid(req.params.id)) return null;
  const f: any = await FoundAnimal.findById(req.params.id);
  if (!f || String(f.finderId) !== uid(req)) return null;
  return f;
}

// PATCH /api/found/:id/steps  { chip?: { result, vetName }, council?: { who } }
export async function updateSteps(req: Request, res: Response) {
  const f = await own(req);
  if (!f) return res.status(404).json({ error: 'not_found' });
  if (!['buscando', 'acogida_pedida'].includes(f.status)) return res.status(409).json({ error: 'closed' });
  const { chip, council } = req.body || {};
  if (chip) {
    if (!['none', 'has_chip'].includes(chip.result)) return res.status(400).json({ error: 'invalid_chip_result' });
    f.chip = { result: chip.result, vetName: typeof chip.vetName === 'string' ? chip.vetName.trim().slice(0, 120) : undefined, at: new Date() };
    // Con chip, su familia está localizada: el veterinario la avisa por el
    // registro. Aquí se acaba el camino.
    if (chip.result === 'has_chip') {
      f.status = 'reunido';
      f.closedAt = new Date();
    }
  }
  if (council) {
    const who = typeof council.who === 'string' ? council.who.trim().slice(0, 160) : '';
    if (!who) return res.status(400).json({ error: 'council_who_required' });
    f.council = { who, at: new Date() };
  }
  await f.save();
  res.json(view(f.toObject(), uid(req)));
}

// POST /api/found/:id/close  { reason: 'reunido' | 'retirado' }
export async function close(req: Request, res: Response) {
  const f = await own(req);
  if (!f) return res.status(404).json({ error: 'not_found' });
  if (f.status === 'en_acogida') return res.status(409).json({ error: 'in_foster' });
  const reason = req.body?.reason === 'reunido' ? 'reunido' : 'retirado';
  f.status = reason;
  f.closedAt = new Date();
  await f.save();
  res.json(view(f.toObject(), uid(req)));
}

// POST /api/found/:id/claim — «Es mío»: abre conversación con quien lo encontró.
export async function claim(req: Request, res: Response) {
  if (!Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const f: any = await FoundAnimal.findById(req.params.id).lean();
  if (!f || !PUBLIC_STATUSES.includes(f.status)) return res.status(404).json({ error: 'not_found' });
  const me = uid(req);
  if (String(f.finderId) === me) return res.status(400).json({ error: 'own_found' });
  let c: any = await FoundClaim.findOne({ foundId: String(f._id), claimantId: me });
  const isNew = !c;
  if (!c) c = await FoundClaim.create({ foundId: String(f._id), claimantId: me, finderId: String(f.finderId) });
  const conv = await ensureConversation('found_claim', String(c._id), me);
  if (isNew) {
    const claimant: any = await User.findById(me).select('name').lean();
    const name = f.name || 'el animal que encontraste';
    await postSystemMessage({
      kind: 'found_claim', refId: String(c._id), code: 'found.claim', actorId: me,
      body: `${displayName(claimant)} cree que ${f.name ? `«${f.name}»` : 'este animal'} es suyo. Pedidle fotos o datos que solo sepa su familia antes de entregarlo.`,
      payload: { foundId: String(f._id) },
    });
    push(String(f.finderId), 'Alguien cree que es suyo 🐾', `${displayName(claimant)} ha escrito sobre ${name}.`, `/mensajes/${conv._id}`);
  }
  res.json({ conversationId: String(conv._id) });
}

// GET /api/found/shelters — protectoras verificadas a las que pedir acogida.
export async function shelters(_req: Request, res: Response) {
  const items = await User.find({ role: 'landlord', deletedAt: null }).select('name profile.orgName profile.address.city').lean();
  const ok = await Promise.all(items.map(async (u: any) => ((await canReceiveDonations(String(u._id))) ? u : null)));
  res.json({
    items: ok.filter(Boolean).map((u: any) => ({ id: String(u._id), name: u.profile?.orgName || u.name, city: u.profile?.address?.city })),
  });
}

// POST /api/found/:id/foster  { shelterId, message }
export async function requestFoster(req: Request, res: Response) {
  const f = await own(req);
  if (!f) return res.status(404).json({ error: 'not_found' });
  if (f.status !== 'buscando') return res.status(409).json({ error: f.status === 'acogida_pedida' ? 'already_requested' : 'closed' });
  const blockers = fosterBlockers(f);
  if (blockers.length) return res.status(409).json({ error: 'steps_pending', blockers });
  const { shelterId } = req.body || {};
  if (!shelterId || !Types.ObjectId.isValid(String(shelterId))) return res.status(400).json({ error: 'invalid_shelter' });
  const shelter: any = await User.findOne({ _id: shelterId, role: 'landlord', deletedAt: null }).select('name email profile.orgName').lean();
  if (!shelter || !(await canReceiveDonations(String(shelterId)))) return res.status(404).json({ error: 'shelter_not_found' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 1000) : '';
  const intent = req.body?.intent === 'keep' ? 'keep' : 'find_home';

  f.foster = { shelterId: String(shelterId), intent, message, requestedAt: new Date(), signatures: [] };
  f.status = 'acogida_pedida';
  await f.save();
  const me = uid(req);
  const finder: any = await User.findById(me).select('name').lean();
  const what = f.name ? `«${f.name}»` : `un ${f.species === 'cat' ? 'gato' : f.species === 'dog' ? 'perro' : 'animal'} encontrado`;
  await postSystemMessage({
    kind: 'foster', refId: String(f._id), code: 'foster.requested', actorId: me,
    body: intent === 'keep'
      ? `${displayName(finder)} ha encontrado ${what} en ${f.foundPlace} y quiere quedárselo. Os pide que lo registréis a vuestro nombre y se lo deis en adopción. El animal sigue en su casa: no ocupa sitio en el refugio.`
      : `${displayName(finder)} pide acogida para ${what} (encontrado en ${f.foundPlace}). El animal sigue en su casa como casa de acogida: no ocupa sitio en el refugio. Vosotros lo registráis y le buscáis familia.`,
    payload: { foundId: String(f._id) },
  });
  if (message) {
    const conv = await ensureConversation('foster', String(f._id));
    const Message = (await import('../models/message.model')).default;
    await Message.create({ conversationId: String(conv._id), senderId: me, type: 'user', body: message, readBy: [me] });
  }
  push(String(shelterId), 'Piden acogida para un animal encontrado', `${displayName(finder)} pide que lo acojáis. Respóndele desde Mensajes.`, '/mensajes');
  try {
    if (shelter.email) {
      await sendEmail(shelter.email, 'Piden acogida para un animal encontrado',
        `${displayName(finder)} ha encontrado ${what} en ${f.foundPlace}. ${intent === 'keep' ? 'Quiere quedárselo y os pide que lo registréis a vuestro nombre y se lo deis en adopción.' : 'Os pide que lo acojáis para buscarle familia.'} El animal sigue en su casa: no os ocupa sitio. Ha mirado el chip (no tiene) y ha avisado al ayuntamiento. Respondedle desde Mensajes: ${FRONTEND()}/mensajes`);
    }
  } catch {}
  res.json(view(f.toObject(), me));
}

async function asShelter(req: Request) {
  if (!Types.ObjectId.isValid(req.params.id)) return null;
  const f: any = await FoundAnimal.findById(req.params.id);
  if (!f?.foster?.shelterId || f.foster.shelterId !== uid(req)) return null;
  return f;
}

function agreementText(o: { shelter: any; finder: any; f: any }) {
  const d = new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric' });
  const name = o.f.name ? `«${o.f.name}»` : 'el animal';
  return [
    'ACUERDO DE CASA DE ACOGIDA',
    '',
    `Fecha: ${d}.`,
    '',
    `Entidad: ${o.shelter.profile?.orgName || o.shelter.name}, en adelante «la protectora».`,
    `Casa de acogida: ${o.finder.name} (${o.finder.email}).`,
    '',
    `Animal: ${name}, encontrado el ${new Date(o.f.foundAt).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })} en ${o.f.foundPlace}. Leído el chip en un veterinario: no tiene. Aviso al ayuntamiento: ${o.f.council?.who || 'hecho'}.`,
    '',
    'Acuerdan, según el artículo 3 l) de la Ley 7/2023 (casa de acogida en colaboración formalizada con una entidad de protección animal):',
    '1. La casa de acogida cuida al animal en su domicilio de forma provisional, con buenas condiciones de higiene, alimentación y atención veterinaria.',
    o.f.foster?.intent === 'keep'
      ? '2. La protectora se hace cargo del animal a efectos legales: lo identifica y registra a su nombre y se lo da en adopción a la casa de acogida, que quiere quedárselo.'
      : '2. La protectora se hace cargo del animal a efectos legales: lo identifica y registra a su nombre, publica su ficha y es quien firma su adopción.',
    '3. La casa de acogida no puede ceder ni vender el animal por su cuenta. Si aparece su familia, avisa a la protectora.',
    '4. Los gastos veterinarios se acuerdan entre las dos partes por escrito en el chat de MyPetLive.',
    '5. Cualquiera de las dos puede terminar la acogida avisando con tiempo; el animal queda entonces a cargo de la protectora.',
    '',
    'La protectora aceptó la acogida en MyPetLive. La casa de acogida firma con su nombre, fecha y hora.',
  ].join('\n');
}

// POST /api/found/:id/foster/accept — la protectora acepta.
export async function acceptFoster(req: Request, res: Response) {
  const f = await asShelter(req);
  if (!f) return res.status(404).json({ error: 'not_found' });
  if (f.status !== 'acogida_pedida' || f.foster.acceptedAt) return res.status(409).json({ error: 'not_pending' });
  const [shelter, finder]: any[] = await Promise.all([
    User.findById(uid(req)).select('name profile.orgName').lean(),
    User.findById(f.finderId).select('name email').lean(),
  ]);
  f.foster.acceptedAt = new Date();
  f.foster.agreementText = agreementText({ shelter, finder, f });
  f.markModified('foster');
  await f.save();
  await postSystemMessage({
    kind: 'foster', refId: String(f._id), code: 'foster.accepted', actorId: uid(req),
    body: `${displayName({ ...shelter, role: 'landlord' })} acepta la acogida. Falta que firmes el acuerdo de casa de acogida.`,
    payload: { foundId: String(f._id) },
  });
  push(String(f.finderId), '¡Han aceptado la acogida! 🏠', 'Firma el acuerdo de casa de acogida desde Mensajes.', `/acogida/${f._id}`);
  res.json({ ok: true });
}

// POST /api/found/:id/foster/reject — la protectora no puede.
export async function rejectFoster(req: Request, res: Response) {
  const f = await asShelter(req);
  if (!f) return res.status(404).json({ error: 'not_found' });
  if (f.status !== 'acogida_pedida' || f.foster.signatures?.length) return res.status(409).json({ error: 'not_pending' });
  f.foster.rejectedAt = new Date();
  f.markModified('foster');
  f.status = 'buscando';
  await f.save();
  await postSystemMessage({
    kind: 'foster', refId: String(f._id), code: 'foster.rejected', actorId: uid(req),
    body: 'La protectora no puede acogerlo ahora. Puedes pedírselo a otra.',
    payload: { foundId: String(f._id) },
  });
  push(String(f.finderId), 'La protectora no puede acogerlo', 'Puedes pedírselo a otra protectora.', `/buscar-casa/encontrado/${f._id}`);
  res.json({ ok: true });
}

// GET /api/found/:id/agreement — quien lo encontró o la protectora.
export async function getAgreement(req: Request, res: Response) {
  if (!Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const f: any = await FoundAnimal.findById(req.params.id).lean();
  const me = uid(req);
  if (!f?.foster?.agreementText || (String(f.finderId) !== me && f.foster.shelterId !== me)) return res.status(404).json({ error: 'not_found' });
  res.json({
    foundId: String(f._id), name: f.name, text: f.foster.agreementText, role: String(f.finderId) === me ? 'finder' : 'shelter',
    acceptedAt: f.foster.acceptedAt, signatures: (f.foster.signatures || []).map((s: any) => ({ fullName: s.fullName, at: s.at })),
    animalId: f.animalId, status: f.status,
  });
}

// POST /api/found/:id/agreement/sign  { fullName } — firma la casa de acogida.
// Con la firma se crea la ficha del animal en el panel de la protectora, en
// borrador: la completa (y le pone el chip a su nombre) antes de publicarla.
export async function signAgreement(req: Request, res: Response) {
  const f = await own(req);
  if (!f) return res.status(404).json({ error: 'not_found' });
  if (f.status !== 'acogida_pedida' || !f.foster?.acceptedAt) return res.status(409).json({ error: 'not_accepted' });
  if (f.foster.signatures?.length) return res.status(409).json({ error: 'already_signed' });
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim().replace(/\s+/g, ' ') : '';
  if (fullName.length < 5 || !fullName.includes(' ')) return res.status(400).json({ error: 'full_name_required' });
  const me = uid(req);
  f.foster.signatures = [{ userId: me, fullName: fullName.slice(0, 120), at: new Date(), ip: req.ip, userAgent: String(req.get('user-agent') || '').slice(0, 300) }];
  f.markModified('foster');
  const keep = f.foster.intent === 'keep';
  const animal = await Animal.create({
    name: f.name || 'Sin nombre',
    species: f.species,
    sex: f.sex,
    age: f.approxAge || 'Edad desconocida',
    city: f.city,
    description: f.description,
    images: f.images,
    shelter: f.foster.shelterId,
    createdByRole: 'protectora',
    isPersonalPet: false,
    // Para quedárselo no se publica: queda reservado para quien lo encontró.
    status: keep ? 'reservado' : 'borrador',
    foster: { userId: me, since: new Date(), foundId: String(f._id) },
  });
  f.animalId = String(animal._id);
  // «Quedármelo yo»: la adopción a su nombre ya en marcha. La protectora la
  // aprueba desde su panel de solicitudes, como cualquier otra, y el animal
  // pasa a «Mi mascota» de quien lo encontró.
  let adoptionId: string | undefined;
  if (keep) {
    const adoption = await Adoption.create({
      animalId: String(animal._id), adopterId: me, status: 'preaprobada',
      history: [{ action: 'created', payload: { from: 'found_keep', foundId: String(f._id) } }],
    });
    adoptionId = String(adoption._id);
  }
  f.status = 'en_acogida';
  await f.save();
  await postSystemMessage({
    kind: 'foster', refId: String(f._id), code: 'foster.signed', actorId: me,
    body: keep
      ? `${fullName} ha firmado el acuerdo. La protectora tiene la adopción a su nombre en «Solicitudes de adopción»: cuando le ponga el chip a nombre de la protectora y la apruebe, pasará a su «Mi mascota».`
      : `${fullName} ha firmado el acuerdo: ya es casa de acogida. La ficha del animal está en el panel de la protectora como borrador; la completará y la publicará.`,
    payload: { foundId: String(f._id), animalId: String(animal._id), adoptionId, keep },
  });
  push(f.foster.shelterId, 'Acuerdo de acogida firmado', keep ? 'Tienes su adopción en «Solicitudes de adopción».' : 'Tienes la ficha en borrador en «Mis animales».', keep ? '/landlord/adoptions' : '/landlord/animals');
  res.json({ ok: true, animalId: String(animal._id), adoptionId });
}
