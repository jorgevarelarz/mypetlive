import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Animal } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { User } from '../models/user.model';
import { CessionContract } from '../models/cessionContract.model';
import { applyStatusChange } from './adoption.controller';
import { postSystemMessage } from '../utils/chat';
import { normalizeSpecies } from '../utils/species';
import { sendPushToUser } from '../utils/push';
import { sendEmail } from '../utils/notification';
import { TERMINAL_ADOPTION_STATUSES } from '../utils/adoptionTransitions';
import logger from '../utils/logger';

// Particulares que buscan casa a un animal suyo: CESIÓN GRATUITA (Ley 7/2023).
// «Adopción» en sentido legal solo la dan protectoras y centros públicos (art.
// 58.4); un particular cede, con contrato (58.2), un animal identificado y
// registrado a su nombre (27 m, 58.1), y nunca perros, gatos ni hurones de
// menos de 8 semanas (58.3). Solo pueden publicar los usuarios que el admin
// activa (User.rehome.enabled).
//
// El particular va en `animal.shelter`, como una protectora: así reutiliza las
// solicitudes, el chat y el traspaso a «Mi mascota» de las adopciones. Lo que
// cambia es cómo se cierra: no hay «aprobar» a mano, se cierra cuando los dos
// han firmado el contrato.

const uid = (req: Request) => String((req as any).user?._id || (req as any).user?.id || '');
const FRONTEND = () => process.env.FRONTEND_URL || 'https://mypetlive.es';

const SPECIES = ['dog', 'cat', 'rabbit', 'bird', 'ferret', 'other'];
const EIGHT_WEEKS_SPECIES = ['dog', 'cat', 'ferret'];
const MIN_DAYS = 56;
const OPEN = (s: string) => !TERMINAL_ADOPTION_STATUSES.includes(s as any);

const SPECIES_ES: Record<string, string> = { dog: 'perro', cat: 'gato', rabbit: 'conejo', bird: 'ave', ferret: 'hurón', other: 'otro' };

async function canRehome(userId: string) {
  const u: any = await User.findById(userId).select('rehome deletedAt').lean();
  return Boolean(u?.rehome?.enabled && !u.deletedAt);
}

/** Días de vida, o null si no se sabe. */
const ageDays = (birthDate?: Date | string | null) =>
  birthDate ? Math.floor((Date.now() - new Date(birthDate).getTime()) / 86_400_000) : null;

/** ¿Se puede ceder ya por edad? Solo la ley de perros, gatos y hurones. */
function tooYoung(animal: any): { tooYoung: boolean; availableFrom?: Date } {
  if (!EIGHT_WEEKS_SPECIES.includes(String(animal.species))) return { tooYoung: false };
  const days = ageDays(animal.birthDate);
  if (days === null || days >= MIN_DAYS) return { tooYoung: false };
  return { tooYoung: true, availableFrom: new Date(new Date(animal.birthDate).getTime() + MIN_DAYS * 86_400_000) };
}

/** «11 semanas», «4 meses», «2 años»: la ficha guarda la edad también en texto. */
function ageText(birthDate: Date): string {
  const days = ageDays(birthDate) ?? 0;
  if (days < 7 * 16) return `${Math.max(1, Math.floor(days / 7))} semanas`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} meses`;
  return `${Math.floor(months / 12)} años`;
}

function push(userId: string, title: string, body: string, url: string) {
  void sendPushToUser(userId, { title, body, url }).catch(err => logger.error({ err }, '[cesión] fallo al enviar push'));
}

// GET /api/rehome/status
export async function status(req: Request, res: Response) {
  res.json({ enabled: await canRehome(uid(req)) });
}

// PATCH /api/rehome/admin/users/:id  { enabled }
export async function adminSetRehome(req: Request, res: Response) {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'not_found' });
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled_required' });
  const u: any = await User.findById(id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  u.rehome = { enabled, by: uid(req), at: new Date() };
  await u.save();
  // Al quitarlo, sus anuncios abiertos dejan de verse. Lo que ya está en marcha
  // (alguien elegido, contrato a medias) sigue: no se deja a nadie a medias.
  if (!enabled) {
    await Animal.updateMany({ shelter: u._id, createdByRole: 'particular', status: 'publicado' }, { status: 'no_disponible' });
  }
  res.json({ enabled });
}

// GET /api/rehome/animals — los animales que he publicado, con sus solicitudes.
export async function listMine(req: Request, res: Response) {
  const me = uid(req);
  const animals = await Animal.find({ shelter: me, cession: { $exists: true } })
    .select('name species sex birthDate images status city cession code createdAt ownerId')
    .sort({ createdAt: -1 }).lean();
  const ids = animals.map(a => String(a._id));
  const adoptions = await Adoption.find({ animalId: { $in: ids } }).select('animalId adopterId status createdAt').sort({ createdAt: 1 }).lean();
  const [adopters, contracts] = await Promise.all([
    User.find({ _id: { $in: adoptions.map(a => a.adopterId) } }).select('name').lean(),
    CessionContract.find({ adoptionId: { $in: adoptions.map(a => String(a._id)) } }).select('adoptionId signatures completedAt titleChangedAt cancelledAt').lean(),
  ]);
  const nameOf = new Map(adopters.map((u: any) => [String(u._id), u.name]));
  const contractOf = new Map(contracts.map((c: any) => [c.adoptionId, c]));
  res.json({
    items: animals.map((a: any) => ({
      ...a,
      ...tooYoung(a),
      requests: adoptions.filter(r => r.animalId === String(a._id)).map((r: any) => {
        const c: any = contractOf.get(String(r._id));
        return {
          adoptionId: String(r._id),
          adopterName: nameOf.get(String(r.adopterId)) || 'Usuario',
          status: r.status,
          createdAt: r.createdAt,
          contract: c && !c.cancelledAt
            ? { signedByMe: c.signatures.some((s: any) => s.userId === me), signatures: c.signatures.length, completedAt: c.completedAt, titleChangedAt: c.titleChangedAt }
            : null,
        };
      }),
    })),
  });
}

// POST /api/rehome/animals — publicar un animal propio para cederlo.
export async function createListing(req: Request, res: Response) {
  const me = uid(req);
  if (!(await canRehome(me))) return res.status(403).json({ error: 'rehome_not_enabled' });
  const b = req.body || {};
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '';
  const species = normalizeSpecies(b.species);
  const microchip = String(b.microchip || '').replace(/\D/g, '');
  const birthDate = b.birthDate ? new Date(b.birthDate) : null;
  if (!name) return res.status(400).json({ error: 'name_required' });
  if (!species || !SPECIES.includes(species)) return res.status(400).json({ error: 'invalid_species' });
  if (microchip.length !== 15) return res.status(400).json({ error: 'invalid_microchip' });
  if (b.declaration !== true) return res.status(400).json({ error: 'declaration_required' });
  if (birthDate && (Number.isNaN(birthDate.getTime()) || birthDate.getTime() > Date.now())) return res.status(400).json({ error: 'invalid_birth_date' });
  // Sin fecha no podemos comprobar las 8 semanas: en perros, gatos y hurones se pide.
  if (!birthDate && EIGHT_WEEKS_SPECIES.includes(species)) return res.status(400).json({ error: 'birth_date_required' });
  const images = Array.isArray(b.images)
    ? b.images.filter((u: unknown) => typeof u === 'string' && /^(\/uploads\/|https?:\/\/)/.test(u)).slice(0, 8)
    : [];
  if (!images.length) return res.status(400).json({ error: 'photo_required' });
  // Un mismo chip no puede estar anunciado dos veces a la vez.
  const dup = await Animal.exists({ 'cession.microchip': microchip, status: { $in: ['publicado', 'reservado'] } });
  if (dup) return res.status(409).json({ error: 'microchip_already_listed' });

  const animal = await Animal.create({
    name,
    species,
    sex: ['male', 'female'].includes(b.sex) ? b.sex : null,
    birthDate: birthDate || undefined,
    age: birthDate ? ageText(birthDate) : typeof b.age === 'string' && b.age.trim() ? b.age.trim().slice(0, 40) : 'Edad desconocida',
    city: typeof b.city === 'string' ? b.city.trim().slice(0, 80) : undefined,
    description: typeof b.description === 'string' ? b.description.trim().slice(0, 2000) : undefined,
    images,
    shelter: me,
    createdByRole: 'particular',
    isPersonalPet: false,
    status: 'publicado',
    cession: { microchip, declaredAt: new Date() },
  });
  res.status(201).json(animal);
}

async function ownListing(req: Request, animalId: string) {
  if (!Types.ObjectId.isValid(animalId)) return null;
  const animal: any = await Animal.findById(animalId);
  if (!animal || String(animal.shelter) !== uid(req) || !animal.cession) return null;
  return animal;
}

// POST /api/rehome/animals/:id/withdraw — retirar el anuncio.
export async function withdraw(req: Request, res: Response) {
  const animal = await ownListing(req, req.params.id);
  if (!animal) return res.status(404).json({ error: 'not_found' });
  if (animal.status === 'adoptado') return res.status(409).json({ error: 'already_ceded' });
  const chosen = await Adoption.exists({ animalId: String(animal._id), status: 'preaprobada' });
  if (chosen) return res.status(409).json({ error: 'someone_chosen' });
  animal.status = 'archivado';
  await animal.save();
  // Las solicitudes abiertas se cierran con su aviso: no se quedan esperando.
  const open = await Adoption.find({ animalId: String(animal._id), status: { $nin: TERMINAL_ADOPTION_STATUSES } });
  for (const app of open) await applyStatusChange(app, animal, 'rechazada', uid(req));
  res.json({ ok: true });
}

/** Solicitud de un animal que cedo yo (o null). */
async function myRequest(req: Request) {
  const { adoptionId } = req.params;
  if (!Types.ObjectId.isValid(adoptionId)) return null;
  const app: any = await Adoption.findById(adoptionId);
  if (!app) return null;
  const animal: any = await Animal.findById(app.animalId);
  if (!animal?.cession || String(animal.shelter) !== uid(req)) return null;
  return { app, animal };
}

function contractText(o: { from: any; to: any; animal: any; date: Date }) {
  const d = o.date.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric' });
  const born = o.animal.birthDate
    ? new Date(o.animal.birthDate).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric' })
    : 'desconocida';
  const sexo = o.animal.sex === 'male' ? 'macho' : o.animal.sex === 'female' ? 'hembra' : 'sin indicar';
  return [
    'CONTRATO DE CESIÓN GRATUITA DE ANIMAL DE COMPAÑÍA',
    '',
    `Fecha: ${d}.`,
    '',
    `Cede: ${o.from.name} (${o.from.email}), en adelante «quien cede».`,
    `Recibe: ${o.to.name} (${o.to.email}), en adelante «quien recibe».`,
    '',
    'Animal:',
    `- Nombre: ${o.animal.name}`,
    `- Especie: ${SPECIES_ES[o.animal.species] || o.animal.species}. Sexo: ${sexo}.`,
    `- Fecha de nacimiento: ${born}.`,
    `- Número de microchip: ${o.animal.microchip}.`,
    '',
    'Acuerdan:',
    '1. Quien cede entrega el animal a quien recibe de forma GRATUITA, sin ningún pago ni contraprestación, como exige el artículo 58.2 de la Ley 7/2023, de 28 de marzo, de protección de los derechos y el bienestar de los animales.',
    '2. Quien cede declara que el animal está identificado con el microchip indicado y registrado a su nombre, y que no conoce ninguna enfermedad o problema de comportamiento que no haya contado a quien recibe.',
    '3. Quien recibe se compromete a cuidar del animal según la Ley 7/2023 y la normativa de su comunidad autónoma, y a no abandonarlo.',
    '4. Las dos partes harán el cambio de titularidad del microchip en el registro de animales de compañía de su comunidad (en Galicia, el REGIAC) lo antes posible desde la entrega.',
    '5. Si quien recibe no pudiera seguir cuidando del animal, intentará primero devolverlo a quien cede o buscarle otro hogar responsable, nunca abandonarlo.',
    '',
    'Las dos partes firman este contrato en MyPetLive. Cada firma queda registrada con el nombre escrito, la fecha y la hora.',
  ].join('\n');
}

// POST /api/rehome/adoptions/:adoptionId/choose — elegir a esta persona.
export async function choose(req: Request, res: Response) {
  const found = await myRequest(req);
  if (!found) return res.status(404).json({ error: 'not_found' });
  const { app, animal } = found;
  const me = uid(req);
  if (!OPEN(app.status)) return res.status(409).json({ error: 'adoption_already_closed' });
  if (app.status === 'preaprobada') return res.status(409).json({ error: 'already_chosen' });
  const other = await Adoption.exists({ animalId: String(animal._id), _id: { $ne: app._id }, status: 'preaprobada' });
  if (other) return res.status(409).json({ error: 'someone_else_chosen' });
  const young = tooYoung(animal);
  if (young.tooYoung) return res.status(409).json({ error: 'too_young', availableFrom: young.availableFrom });

  const [from, to]: any[] = await Promise.all([
    User.findById(me).select('name email').lean(),
    User.findById(app.adopterId).select('name email').lean(),
  ]);
  await applyStatusChange(app, animal, 'preaprobada', me, { quiet: true });
  const now = new Date();
  const data = {
    animalId: String(animal._id),
    fromUserId: me,
    toUserId: String(app.adopterId),
    text: contractText({ from, to, animal: { ...animal.toObject(), microchip: animal.cession.microchip }, date: now }),
    animal: { name: animal.name, species: animal.species, sex: animal.sex, birthDate: animal.birthDate, microchip: animal.cession.microchip },
    signatures: [],
    completedAt: undefined,
    cancelledAt: undefined,
  };
  await CessionContract.findOneAndUpdate({ adoptionId: String(app._id) }, { $set: data }, { upsert: true, new: true });

  await postSystemMessage({
    kind: 'adoption', refId: String(app._id), code: 'cession.contract', actorId: me,
    body: `${from?.name || 'Quien cede'} ha elegido a ${to?.name || 'quien lo pidió'} para ${animal.name}. Ya podéis firmar el contrato de cesión.`,
    payload: { adoptionId: String(app._id), animalName: animal.name },
  });
  push(String(app.adopterId), `¡Te han elegido para ${animal.name}! 🐾`, 'Firma el contrato de cesión desde Mensajes.', `/contratos/${app._id}`);
  try {
    if (to?.email) {
      await sendEmail(to.email, `Te han elegido para ${animal.name}`,
        `${from?.name || 'La persona que lo cede'} te ha elegido para ${animal.name}. Para terminar, firmad los dos el contrato de cesión gratuita:\n${FRONTEND()}/contratos/${app._id}`);
    }
  } catch {}
  res.json({ ok: true, status: app.status });
}

// POST /api/rehome/adoptions/:adoptionId/reject
export async function reject(req: Request, res: Response) {
  const found = await myRequest(req);
  if (!found) return res.status(404).json({ error: 'not_found' });
  const { app, animal } = found;
  if (!OPEN(app.status)) return res.status(409).json({ error: 'adoption_already_closed' });
  await applyStatusChange(app, animal, 'rechazada', uid(req));
  await CessionContract.updateOne({ adoptionId: String(app._id), completedAt: null }, { cancelledAt: new Date() });
  res.json({ ok: true, status: app.status });
}

async function loadContract(req: Request) {
  const { adoptionId } = req.params;
  if (!Types.ObjectId.isValid(adoptionId)) return null;
  const c: any = await CessionContract.findOne({ adoptionId });
  const me = uid(req);
  if (!c || (c.fromUserId !== me && c.toUserId !== me)) return null;
  return c;
}

// GET /api/rehome/contracts/:adoptionId
export async function getContract(req: Request, res: Response) {
  const c = await loadContract(req);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const me = uid(req);
  const [from, to]: any[] = await Promise.all([
    User.findById(c.fromUserId).select('name').lean(),
    User.findById(c.toUserId).select('name').lean(),
  ]);
  res.json({
    adoptionId: c.adoptionId,
    text: c.text,
    animal: c.animal,
    role: c.fromUserId === me ? 'from' : 'to',
    fromName: from?.name, toName: to?.name,
    signatures: c.signatures.map((s: any) => ({ who: s.userId === c.fromUserId ? 'from' : 'to', fullName: s.fullName, at: s.at })),
    signedByMe: c.signatures.some((s: any) => s.userId === me),
    completedAt: c.completedAt, titleChangedAt: c.titleChangedAt, cancelledAt: c.cancelledAt,
  });
}

// POST /api/rehome/contracts/:adoptionId/sign  { fullName }
export async function sign(req: Request, res: Response) {
  const c = await loadContract(req);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const me = uid(req);
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim().replace(/\s+/g, ' ') : '';
  if (fullName.length < 5 || !fullName.includes(' ')) return res.status(400).json({ error: 'full_name_required' });
  if (c.cancelledAt) return res.status(409).json({ error: 'contract_cancelled' });
  if (c.completedAt) return res.status(409).json({ error: 'already_completed' });
  if (c.signatures.some((s: any) => s.userId === me)) return res.status(409).json({ error: 'already_signed' });
  const app: any = await Adoption.findById(c.adoptionId);
  const animal: any = await Animal.findById(c.animalId);
  if (!app || !animal || app.status !== 'preaprobada') return res.status(409).json({ error: 'adoption_not_ready' });
  if (tooYoung(animal).tooYoung) return res.status(409).json({ error: 'too_young' });

  c.signatures.push({ userId: me, fullName: fullName.slice(0, 120), at: new Date(), ip: req.ip, userAgent: String(req.get('user-agent') || '').slice(0, 300) });
  const both = c.signatures.length >= 2;
  if (both) c.completedAt = new Date();
  await c.save();

  const other = c.fromUserId === me ? c.toUserId : c.fromUserId;
  if (!both) {
    await postSystemMessage({
      kind: 'adoption', refId: c.adoptionId, code: 'cession.signed', actorId: me,
      body: `${fullName} ha firmado el contrato de cesión de ${animal.name}. Falta la otra firma.`,
      payload: { adoptionId: c.adoptionId },
    });
    push(other, `Contrato de ${animal.name}: falta tu firma`, `${fullName} ya ha firmado.`, `/contratos/${c.adoptionId}`);
    return res.json({ ok: true, completed: false });
  }

  // Las dos firmas: el animal pasa a la nueva familia (mismo traspaso que una
  // adopción aprobada: «Mi mascota», linaje, plan de bienvenida, otras
  // solicitudes cerradas) y se recuerda el cambio de titular del microchip.
  await applyStatusChange(app, animal, 'aprobada', me);
  await postSystemMessage({
    kind: 'adoption', refId: c.adoptionId, code: 'cession.title_change', actorId: undefined,
    body: `Falta un paso: el cambio de titular del microchip de ${animal.name}. Lo hace cualquier veterinario en el registro (en Galicia, el REGIAC). Llevad el contrato.`,
    payload: { adoptionId: c.adoptionId, animalName: animal.name },
  });
  push(c.fromUserId, `${animal.name} ya tiene nueva familia`, 'Recuerda el cambio de titular del microchip en el veterinario.', `/contratos/${c.adoptionId}`);
  res.json({ ok: true, completed: true });
}

// POST /api/rehome/contracts/:adoptionId/title-changed — quien cede lo marca.
export async function titleChanged(req: Request, res: Response) {
  const c = await loadContract(req);
  if (!c) return res.status(404).json({ error: 'not_found' });
  if (!c.completedAt) return res.status(409).json({ error: 'not_completed' });
  if (!c.titleChangedAt) {
    c.titleChangedAt = new Date();
    await c.save();
    await postSystemMessage({
      kind: 'adoption', refId: c.adoptionId, code: 'cession.title_done', actorId: uid(req),
      body: `Cambio de titular del microchip hecho. ${c.animal?.name || 'El animal'} ya está a nombre de su nueva familia.`,
      payload: { adoptionId: c.adoptionId },
    });
  }
  res.json({ ok: true, titleChangedAt: c.titleChangedAt });
}
