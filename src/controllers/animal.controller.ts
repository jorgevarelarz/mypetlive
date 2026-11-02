import { ADOPTABLE_ROLES, isAdoptableRole } from '../utils/adoptable';
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Animal, ensureAnimalCode } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { AnimalAlert } from '../models/animalAlert.model';
import { User } from '../models/user.model';
import { sendEmail } from '../utils/notification';
import { sendPushToUser } from '../utils/push';
import { publicMemorial, memorialStats, publishedMessages } from './memorial.controller';
import { logAnimalEvent } from '../utils/animalEvents';
import { AnimalEvent } from '../models/animalEvent.model';
import { speciesFilter, speciesVariants } from '../utils/species';
import { ageFromBirthDate, parseBirthDate } from '../utils/age';
import { canPublishAnimals } from '../utils/shelterVerification';
import { canManageAnimal } from '../utils/animalAccess';
import { distanciaKm, geolocalizar, type Lugar } from '../utils/geo';

const allowedStatuses = ['borrador', 'publicado', 'reservado', 'preadoptado', 'adoptado', 'no_disponible', 'archivado'];

// Estados en los que el animal se ve en el catálogo y en el SEO. Solo una
// protectora verificada (o un admin) puede ponerlos. `adoptado` no sale en el
// catálogo y tiene su propia regla: lo pone el flujo de adopción.
const PUBLIC_STATUSES = ['publicado', 'reservado', 'preadoptado'];

function needsVerification(status: unknown): boolean {
  return typeof status === 'string' && PUBLIC_STATUSES.includes(status);
}

// Lo que nunca debe salir de `getById`/`getByCode`/`search` para quien no
// gestiona el animal (ni protectora ni admin): `ownerId` identifica a la
// familia, `lost.sightings` lleva ubicación y contacto de terceros que
// avisaron de un hallazgo, y `__v` es ruido interno de Mongoose. El pasaporte
// público (`getPassport`) ya construye su propia respuesta reducida a mano;
// esto cubre las otras rutas, que hasta ahora devolvían el documento entero.
function stripInternalFields<T extends Record<string, any>>(animal: T): T {
  const { ownerId, __v, ...rest } = animal as any;
  if (rest.lost) rest.lost = { ...rest.lost, sightings: undefined };
  // Cesión de un particular: es una persona, no una entidad. Fuera su correo, y
  // del microchip solo las 4 últimas cifras (el anuncio lo lleva, art. 57.2).
  if (rest.createdByRole === 'particular') {
    if (rest.shelter && typeof rest.shelter === 'object' && 'email' in rest.shelter) {
      const { email, ...shelter } = rest.shelter;
      rest.shelter = shelter;
    }
    if (rest.cession?.microchip) rest.cession = { ...rest.cession, microchip: undefined, microchipLast4: String(rest.cession.microchip).slice(-4) };
  }
  return rest;
}

function matchesAlert(animal: any, filters: Record<string, any>) {
  // La especie del animal se guarda canonizada (gato→cat), pero el filtro de la
  // alerta llega tal cual lo escribió el usuario: comparar por variantes.
  if (filters.species !== undefined && !speciesVariants(filters.species).includes(String(animal.species || '').toLowerCase())) {
    return false;
  }
  for (const key of ['size', 'sex', 'ageGroup', 'goodWithChildren', 'goodWithDogs', 'goodWithCats']) {
    if (filters[key] !== undefined && animal[key] !== filters[key]) return false;
  }
  if (filters.city && !String(animal.city || '').toLowerCase().includes(String(filters.city).toLowerCase())) return false;
  if (filters.q) {
    const haystack = [animal.name, animal.breed, animal.species, animal.description, animal.city]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(String(filters.q).toLowerCase())) return false;
  }
  return true;
}

async function notifyMatchingAlerts(animal: any) {
  const alerts = await AnimalAlert.find({ active: true }).lean();
  const matching = alerts.filter(alert => matchesAlert(animal, alert.filters || {}));
  if (!matching.length) return;
  const users = await User.find({ _id: { $in: matching.map(alert => alert.userId) } }).select('email name').lean();
  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://mypetlive.es';
  await Promise.allSettled(users.flatMap(user => [
    sendEmail(
      user.email,
      `Nuevo compañero compatible: ${animal.name}`,
      `Hola ${user.name || ''}, ${animal.name} coincide con una de tus alertas de MyPetLive. Puedes conocerlo aquí: ${baseUrl}/animals/${animal._id}`,
    ),
    sendPushToUser(String(user._id), {
      title: `Nuevo compañero compatible: ${animal.name}`,
      body: 'Coincide con una de tus alertas. Toca para conocerle.',
      url: `/animals/${animal._id}`,
    }),
  ]));
}

export async function create(req: Request, res: Response) {
  const b: any = req.body || {};
  const user: any = (req as any).user;
  const actorId = String(user?._id || user?.id || '');
  if (user?.role !== 'admin' && b.shelter && String(b.shelter) !== actorId) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (user?.role === 'admin' && b.shelter && String(b.shelter) !== actorId) {
    const shelter = await User.exists({ _id: b.shelter, role: 'landlord' });
    if (!shelter) return res.status(400).json({ error: 'invalid_shelter' });
  }
  // Si no viene, por defecto asignamos la protectora actual
  if (!b.shelter) {
    const u: any = (req as any).user;
    if (u?._id || u?.id) b.shelter = String(u._id || u.id);
  }
  if (needsVerification(b.status) && !(await canPublishAnimals((req as any).user, String(b.shelter || '')))) {
    return res.status(403).json({ error: 'shelter_verification_required' });
  }
  const doc = await Animal.create({ ...b, isPersonalPet: false, createdByRole: 'protectora' });
  await logAnimalEvent({
    animalId: String(doc._id), code: doc.code, type: 'created',
    actorId: String((req as any).user?._id || (req as any).user?.id || ''),
    shelterId: String(doc.shelter), toOwnerId: String(doc.shelter), toOwnerType: 'protectora',
  });
  if (doc.status === 'publicado') notifyMatchingAlerts(doc.toObject()).catch(() => undefined);
  res.status(201).json(doc);
}

export async function update(req: Request, res: Response) {
  const { id } = req.params;
  const current = await Animal.findById(id);
  if (!current) return res.status(404).json({ error: 'not_found' });

  const user: any = (req as any).user;
  if (!canManageAnimal(user, current)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const payload = { ...req.body };
  // Proteger el campo shelter/owner frente a cambios arbitrarios
  delete (payload as any).shelter;
  delete (payload as any).ownerId;

  // `adoptado` lo pone el flujo de adopción, no la edición de la ficha. Si ya lo
  // estaba se acepta: el formulario reenvía siempre el estado actual.
  if (payload.status === 'adoptado' && current.status !== 'adoptado') {
    return res.status(400).json({ error: 'invalid_status_transition' });
  }

  if (payload.status !== current.status && needsVerification(payload.status) && !(await canPublishAnimals(user, String(current.shelter)))) {
    return res.status(403).json({ error: 'shelter_verification_required' });
  }

  const updated = await Animal.findByIdAndUpdate(id, payload, { new: true });
  if (current.status !== 'publicado' && updated?.status === 'publicado') {
    notifyMatchingAlerts(updated.toObject()).catch(() => undefined);
  }
  res.json(updated);
}

export async function getById(req: Request, res: Response) {
  if (!Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  // Sin poblar todavía: `canManageAnimal` compara `animal.shelter` contra el
  // usuario, y `.populate()` sustituye ese ObjectId por el documento (o por
  // `null` si la protectora ya no existe). Decidir el acceso sobre la
  // referencia sin poblar es lo único que no depende de que el populate
  // resuelva.
  const a = await Animal.findById(req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  if (a.isPersonalPet === true) return res.status(404).json({ error: 'not_found' });
  if (!isAdoptableRole(a.createdByRole)) return res.status(404).json({ error: 'not_found' });
  const canManage = canManageAnimal((req as any).user, a);
  // Un borrador no está listo para verse: antes cualquiera con el ID (o
  // adivinándolo) lo veía igual que uno publicado, sin pasar por el catálogo.
  if (a.status === 'borrador' && !canManage) return res.status(404).json({ error: 'not_found' });
  if (!a.code) await ensureAnimalCode(a);
  await a.populate('shelter', 'name email');
  res.json(canManage ? a : stripInternalFields(a.toObject()));
}

export async function getByCode(req: Request, res: Response) {
  const { code } = req.params;
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) {
    return res.status(400).json({ error: 'invalid_code' });
  }

  const animal = await Animal.findOne({ code: normalized });
  if (!animal) return res.status(404).json({ error: 'not_found' });
  if (animal.isPersonalPet === true) return res.status(404).json({ error: 'not_found' });
  if (!isAdoptableRole(animal.createdByRole)) return res.status(404).json({ error: 'not_found' });
  const canManage = canManageAnimal((req as any).user, animal);
  if (animal.status === 'borrador' && !canManage) return res.status(404).json({ error: 'not_found' });
  if (!animal.code) await ensureAnimalCode(animal);
  res.json(canManage ? animal : stripInternalFields(animal.toObject()));
}

// Construye la línea de tiempo unificada del pasaporte (eventos de ciclo de vida + salud/vet).
// `full` (dueño/admin) incluye nombres de las familias; el público recibe versión redactada.
function buildTimeline(animal: any, events: any[], full: boolean) {
  const items: { at: any; type: string; title: string; detail?: string }[] = [];
  const hasCreated = events.some(e => e.type === 'created');
  if (!hasCreated) {
    items.push({ at: animal.createdAt, type: 'created', title: 'Dado de alta', detail: animal.createdByRole === 'tenant' ? 'por su familia' : undefined });
  }
  for (const e of events) {
    // Los registros clínicos (vet/health) ya se renderizan desde vetHistory/
    // healthHistory con formato; el AnimalEvent equivalente es solo auditoría.
    if (e.type === 'vet' || e.type === 'health') continue;
    // Un avistamiento cuenta dónde estuvo el animal y quién lo vio: eso es del
    // episodio de pérdida y de la familia, no del historial público del animal.
    if (e.type === 'sighting' && !full) continue;
    const shelterName = e.shelterId?.name as string | undefined;
    let title = e.type;
    let detail: string | undefined;
    switch (e.type) {
      case 'created':
        if (e.toOwnerType === 'tenant') { title = 'Registrado por su familia'; }
        else { title = 'Dado de alta'; detail = shelterName ? `en ${shelterName}` : 'en una protectora'; }
        break;
      case 'adopted':
        title = 'Adoptado';
        detail = full && e.toOwnerId?.name ? `por ${e.toOwnerId.name}` : (shelterName ? `desde ${shelterName}` : undefined);
        break;
      case 'reserved': title = 'Reservado'; break;
      case 'returned': title = 'De nuevo disponible'; break;
      case 'lost': title = 'Se perdió'; detail = e.data?.area || undefined; break;
      case 'found': title = 'Apareció'; break;
      case 'sighting': title = 'Alguien lo vio'; detail = e.data?.hasLocation ? 'con ubicación' : undefined; break;
      default: title = e.type;
    }
    items.push({ at: e.createdAt, type: e.type, title, detail });
  }
  for (const v of (animal.vetHistory || [])) items.push({ at: v.date, type: 'vet', title: 'Visita veterinaria', detail: v.note });
  for (const h of (animal.healthHistory || [])) items.push({ at: h.date, type: 'health', title: h.type || 'Hito de salud', detail: h.notes });
  return items
    .filter(i => i.at)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

// GET /api/animals/:code/timeline — auth opcional; dueño/admin ven nombres, público redactado.
export async function getTimeline(req: Request, res: Response) {
  const normalized = String(req.params.code || '').trim().toUpperCase();
  if (!normalized) return res.status(400).json({ error: 'invalid_code' });
  const animal: any = await Animal.findOne({ code: normalized }).lean();
  if (!animal) return res.status(404).json({ error: 'not_found' });
  if (animal.status === 'borrador' && !canManageAnimal((req as any).user, animal)) {
    return res.status(404).json({ error: 'not_found' });
  }

  const viewer: any = (req as any).user;
  const viewerId = String(viewer?._id || viewer?.id || '');
  const isOwner = !!viewerId && (String(animal.ownerId || '') === viewerId || String(animal.shelter || '') === viewerId);
  const full = !!viewer && (viewer.role === 'admin' || isOwner);

  const events = await AnimalEvent.find({ animalId: animal._id })
    .sort({ createdAt: 1 })
    .populate('shelterId', 'name')
    .populate('toOwnerId', 'name')
    .populate('fromOwnerId', 'name')
    .lean();

  res.json({ code: animal.code, timeline: buildTimeline(animal, events, full) });
}

// Categorías de registro clínico. 'visit' va a vetHistory (cuenta como visita
// veterinaria); el resto a healthHistory (hitos de salud). Alimentan el pasaporte.
const HEALTH_CATEGORIES = ['visit', 'vaccine', 'deworming', 'surgery', 'checkup', 'test', 'other'] as const;
type HealthCategory = (typeof HEALTH_CATEGORIES)[number];

// Cada cuánto toca repetir, cuando quien apunta no dice otra cosa. Solo para lo
// que de verdad se repite: una cirugía o una prueba no vuelven por calendario.
const DEFAULT_REPEAT_MONTHS: Partial<Record<HealthCategory, number>> = {
  vaccine: 12,
  deworming: 3,
};

function addMonths(from: Date, months: number) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

// POST /api/animals/:code/health — añade un registro clínico al animal
// identificado por su código. Lo refleja el pasaporte.
//
// Lo puede usar un veterinario o el admin, y también **la familia**: el pasaporte
// es del animal, y quien pone la pipeta o lleva la cartilla de vacunas es quien
// vive con él. Mientras esto estuvo cerrado a rol vet, `healthHistory` se quedó
// vacío en todas las mascotas personales.
export async function addHealthRecord(req: Request, res: Response) {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'invalid_code' });

  const body: any = req.body || {};
  const category: HealthCategory = HEALTH_CATEGORIES.includes(body.category) ? body.category : 'visit';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const treatment = typeof body.treatment === 'string' && body.treatment.trim() ? body.treatment.trim() : undefined;
  if (!note) return res.status(400).json({ error: 'note_required' });

  let date = new Date();
  if (body.date) {
    const parsed = new Date(body.date);
    if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'invalid_date' });
    date = parsed;
  }

  const animal: any = await Animal.findOne({ code });
  if (!animal) return res.status(404).json({ error: 'not_found' });

  const user: any = (req as any).user;
  const isClinician = user?.role === 'vet' || user?.role === 'admin';
  if (!isClinician && !canManageAnimal(user, animal)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const actorId = String(user?._id || user?.id || '');

  // Cuándo toca repetirlo. Tres casos, y el silencio no es uno de ellos:
  //   - fecha explícita → esa;
  //   - `nextDueAt: null` → sin recordatorio, decisión del que apunta;
  //   - ausente → el intervalo por defecto de la categoría, si lo tiene.
  let nextDueAt: Date | undefined;
  if (body.nextDueAt === null) {
    nextDueAt = undefined;
  } else if (body.nextDueAt !== undefined) {
    const parsed = new Date(body.nextDueAt);
    if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'invalid_next_due' });
    if (parsed.getTime() <= Date.now()) return res.status(400).json({ error: 'next_due_in_past' });
    nextDueAt = parsed;
  } else {
    const months = DEFAULT_REPEAT_MONTHS[category];
    if (months) nextDueAt = addMonths(date, months);
  }

  if (category === 'visit') {
    animal.vetHistory.push({ date, note, treatment });
  } else {
    animal.healthHistory.push({ date, type: category, notes: note, vetId: actorId || undefined, nextDueAt });
  }
  await animal.save();

  await logAnimalEvent({
    animalId: String(animal._id),
    code: animal.code,
    type: category === 'visit' ? 'vet' : 'health',
    actorId,
    data: { category, note, treatment, date },
  });

  res.status(201).json({
    ok: true,
    category,
    nextDueAt: nextDueAt || null,
    health: { vetVisits: animal.vetHistory.length, healthMilestones: animal.healthHistory.length },
  });
}

// GET /api/animals/passport/:code — público (sin datos personales del dueño actual).
/**
 * El nombre con el que se presenta a una persona en una página pública: su
 * nombre de pila y nada más. `User.name` guarda lo que cada uno escribió al
 * registrarse, y varias usuarias reales pusieron nombre y dos apellidos.
 */
function nombreDePila(user: any): string | undefined {
  const propio = String(user?.profile?.firstName || '').trim();
  if (propio) return propio.slice(0, 40);
  const entero = String(user?.name || '').trim();
  if (!entero) return undefined;
  return entero.split(/\s+/)[0].slice(0, 40);
}

export async function getPassport(req: Request, res: Response) {
  const normalized = String(req.params.code || '').trim().toUpperCase();
  if (!normalized) return res.status(400).json({ error: 'invalid_code' });
  const animal: any = await Animal.findOne({ code: normalized, status: { $ne: 'borrador' } }).lean();
  if (!animal) return res.status(404).json({ error: 'not_found' });

  // 🔴 2 sep 2026 — Quién sale aquí y con qué nombre.
  //
  // Hasta hoy esta consulta traía `animal.shelter` y se pintaba como
  // "Procedencia", y en una mascota de familia `shelter` ES EL DUEÑO (así lo
  // guarda `createPersonal`): el pasaporte publicaba el nombre completo de un
  // particular —"Yerom Sánchez Fernández"— y su ciudad, en una página que
  // cualquiera puede abrir escaneando la chapa del collar. Ahora:
  //
  //   · animal de protectora → "Procedencia", con el nombre de la organización
  //     y su ciudad, que es información pública y además le da confianza a quien
  //     mira una ficha en adopción.
  //   · mascota de familia   → solo el NOMBRE DE PILA ("Sandra"), sin ciudad y
  //     sin apellidos. Lo justo para que quien encuentra al animal sepa a quién
  //     tiene delante, y nada con lo que buscar a nadie.
  //
  // Son DOS personas distintas y hay que buscarlas por separado: la protectora
  // que dio de alta la ficha (`shelter`) y quien responde hoy por el animal
  // (`ownerId`, que en un animal adoptado es el adoptante). Mezclarlas rompe el
  // caso de la adopción — la primera versión de este cambio puso al adoptante en
  // "Procedencia" y lo cazó `animal.passport.test.ts`, que existe justo para eso.
  const esPersonal = animal.isPersonalPet === true;
  const responsableId = animal.ownerId || animal.shelter;
  const [protectora, responsable] = await Promise.all([
    !esPersonal && animal.shelter
      ? User.findById(animal.shelter).select('name profile.address.city').lean()
      : null,
    responsableId ? User.findById(responsableId).select('name profile.firstName').lean() : null,
  ]) as any[];
  const events = await AnimalEvent.find({ animalId: animal._id })
    .sort({ createdAt: 1 })
    .populate('shelterId', 'name')
    .lean();

  const vetCount = (animal.vetHistory || []).length;
  const healthCount = (animal.healthHistory || []).length;

  // Mascota fallecida: el QR enseña su mural. Solo los mensajes que la familia publicó.
  const memorial = animal.memorial?.active
    ? {
      ...publicMemorial(animal),
      stats: await memorialStats(animal),
      messages: await publishedMessages(animal._id),
      by: responsable ? nombreDePila(responsable) : null,
      // La fecha de nacimiento solo sale en el mural: «2014 — 2026» bajo su nombre.
      bornAt: animal.birthDate || null,
    }
    : null;

  res.json({
    code: animal.code,
    name: animal.name,
    species: animal.species,
    breed: animal.breed,
    age: animal.age,
    ageGroup: animal.ageGroup,
    sex: animal.sex,
    size: animal.size,
    images: animal.images || [],
    personality: animal.personality || [],
    status: animal.status,
    isPersonalPet: animal.isPersonalPet,
    provenance: protectora
      ? { shelterName: protectora.name, city: protectora.profile?.address?.city || animal.city }
      : null,
    family: esPersonal && responsable ? { name: nombreDePila(responsable) } : null,
    health: { vetVisits: vetCount, healthMilestones: healthCount },
    // Modo perdido. Se expone la zona donde se perdió (dato del animal, útil para
    // quien lo encuentra) pero NUNCA los avistamientos ni el contacto de la
    // familia: quien lo encuentre escribe por `reportSighting`, que hace de relé.
    lost: animal.lost?.isLost
      ? {
        isLost: true,
        since: animal.lost.since,
        area: animal.lost.area,
        notes: animal.lost.notes,
        // Aquí SÍ se publica cómo avisar, porque es el único momento en que
        // sirve de algo y porque la familia lo escribió sabiendo que se vería
        // (ver el aviso del diálogo de "marcar como perdido"). Se va solo al
        // marcar "ha aparecido": `markFound` borra el campo.
        contact: animal.lost.contact || null,
        contactName: responsable ? nombreDePila(responsable) : null,
      }
      : { isLost: false },
    timeline: buildTimeline(animal, events, false),
    memorial,
  });
}

// ---------------------------------------------------------------------------
// Modo perdido
//
// El QR del pasaporte ya está impreso en la chapa del collar: cuando el animal
// se pierde, esa misma URL es lo que va a mirar quien lo encuentre. Por eso el
// modo perdido no es una pantalla nueva, sino un estado del pasaporte.
// ---------------------------------------------------------------------------

// POST /api/animals/:id/lost — la familia declara que se ha perdido.
export async function markLost(req: Request, res: Response) {
  const animal: any = await Animal.findById(req.params.id);
  if (!animal) return res.status(404).json({ error: 'not_found' });

  const user: any = (req as any).user;
  if (!canManageAnimal(user, animal)) return res.status(403).json({ error: 'forbidden' });

  const area = typeof req.body?.area === 'string' ? req.body.area.trim().slice(0, 200) : undefined;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 500) : undefined;
  // Lo que se publicará en el pasaporte mientras dure la pérdida. Opcional: sin
  // él sigue estando el formulario de aviso, que hace de relé sin enseñar nada.
  const contact = typeof req.body?.contact === 'string' ? req.body.contact.trim().slice(0, 120) : undefined;

  // Volver a marcar perdido un animal ya perdido actualiza la zona pero no
  // reinicia el reloj: "perdido desde hace 3 días" es lo que mueve a la gente.
  const since = animal.lost?.isLost && animal.lost?.since ? animal.lost.since : new Date();

  animal.lost = {
    isLost: true,
    since,
    area,
    notes,
    // Volver a marcarlo perdido sin contacto no borra el que ya había: la
    // segunda llamada suele venir de actualizar la zona.
    contact: contact || animal.lost?.contact,
    sightings: animal.lost?.sightings || [],
  };
  await animal.save();

  await logAnimalEvent({
    animalId: String(animal._id),
    code: animal.code,
    type: 'lost',
    actorId: String(user?._id || user?.id || ''),
    data: { area },
  });

  res.json({ ok: true, lost: { isLost: true, since, area, notes, contact: animal.lost.contact } });
}

// POST /api/animals/:id/found — apareció. Conserva los avistamientos.
export async function markFound(req: Request, res: Response) {
  const animal: any = await Animal.findById(req.params.id);
  if (!animal) return res.status(404).json({ error: 'not_found' });

  const user: any = (req as any).user;
  if (!canManageAnimal(user, animal)) return res.status(403).json({ error: 'forbidden' });

  animal.lost = {
    isLost: false,
    since: undefined,
    area: undefined,
    notes: undefined,
    // El contacto se publicaba solo mientras estaba perdido: aparecer lo borra.
    contact: undefined,
    sightings: animal.lost?.sightings || [],
  };
  await animal.save();

  await logAnimalEvent({
    animalId: String(animal._id),
    code: animal.code,
    type: 'found',
    actorId: String(user?._id || user?.id || ''),
  });

  res.json({ ok: true, lost: { isLost: false } });
}

// GET /api/animals/:id/sightings — solo la familia (o admin).
// Los avistamientos llevan la ubicación y el contacto de terceros: no son
// públicos ni siquiera para el resto de usuarios registrados.
export async function listSightings(req: Request, res: Response) {
  const animal: any = await Animal.findById(req.params.id).lean();
  if (!animal) return res.status(404).json({ error: 'not_found' });

  const user: any = (req as any).user;
  if (!canManageAnimal(user, animal)) return res.status(403).json({ error: 'forbidden' });

  const sightings = [...(animal.lost?.sightings || [])].sort(
    (a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
  res.json({ items: sightings });
}

// POST /api/animals/passport/:code/sighting — PÚBLICO y sin sesión.
// Quien encuentra al animal escanea el QR y avisa. Hace de relé: el que avisa
// nunca ve el contacto de la familia, y la familia recibe el aviso por correo.
export async function reportSighting(req: Request, res: Response) {
  const normalized = String(req.params.code || '').trim().toUpperCase();
  if (!normalized) return res.status(400).json({ error: 'invalid_code' });

  const animal: any = await Animal.findOne({ code: normalized, status: { $ne: 'borrador' } });
  if (!animal) return res.status(404).json({ error: 'not_found' });
  // Sin episodio de pérdida abierto no se aceptan avistamientos: si no, el
  // endpoint es un buzón anónimo hacia el correo de cualquier usuario.
  if (!animal.lost?.isLost) return res.status(409).json({ error: 'not_lost' });

  const rawLat = req.body?.lat;
  const rawLng = req.body?.lng;
  const hasLocation = rawLat !== undefined && rawLat !== null && rawLng !== undefined && rawLng !== null;

  let lat: number | undefined;
  let lng: number | undefined;
  let accuracy: number | undefined;
  if (hasLocation) {
    lat = Number(rawLat);
    lng = Number(rawLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'invalid_location' });
    }
    const rawAccuracy = Number(req.body?.accuracy);
    if (Number.isFinite(rawAccuracy) && rawAccuracy >= 0) accuracy = rawAccuracy;
  }

  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : undefined;
  const contact = typeof req.body?.contact === 'string' ? req.body.contact.trim().slice(0, 120) : undefined;
  if (!hasLocation && !note && !contact) {
    return res.status(400).json({ error: 'empty_sighting' });
  }

  const sighting = { at: new Date(), lat, lng, accuracy, note, contact };
  animal.lost.sightings.push(sighting);
  await animal.save();

  await logAnimalEvent({
    animalId: String(animal._id),
    code: animal.code,
    type: 'sighting',
    data: { hasLocation },
  });

  // Aviso a la familia. Best-effort: que falle el correo no puede hacer que
  // quien encontró al animal reciba un error y no vuelva a intentarlo.
  notifySighting(animal, sighting).catch(() => undefined);

  res.status(201).json({ ok: true });
}

async function notifySighting(animal: any, sighting: any) {
  const ownerId = animal.ownerId || animal.shelter;
  if (!ownerId) return;
  const owner: any = await User.findById(ownerId).select('email name role').lean();
  if (!owner) return;

  // Lo más urgente de la app: va al móvil antes que al correo. Al tocarlo se
  // abre la ficha con los avisos (ubicación, mensaje, contacto).
  const petPath = owner.role === 'landlord' ? '/landlord/animals' : `/pet?mascota=${animal._id}`;
  const pushBody = sighting.note
    ? `«${String(sighting.note).slice(0, 120)}»`
    : sighting.lat !== undefined ? 'Ha compartido dónde está. Toca para verlo en el mapa.' : 'Te ha dejado un aviso. Toca para verlo.';
  await sendPushToUser(String(owner._id), { title: `📍 Han visto a ${animal.name}`, body: pushBody, url: petPath }).catch(() => undefined);

  if (!owner.email) return;

  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://mypetlive.es';
  const lines = [
    `Hola ${owner.name || ''},`,
    '',
    `Alguien ha escaneado el QR de ${animal.name} y ha dejado un aviso.`,
    '',
  ];
  if (sighting.lat !== undefined && sighting.lng !== undefined) {
    const precision = sighting.accuracy ? ` (precisión aproximada: ${Math.round(sighting.accuracy)} m)` : '';
    lines.push(`Ubicación${precision}: https://www.google.com/maps?q=${sighting.lat},${sighting.lng}`);
  } else {
    lines.push('No ha compartido su ubicación.');
  }
  if (sighting.note) lines.push('', `Mensaje: ${sighting.note}`);
  if (sighting.contact) lines.push('', `Puedes contactar con esta persona en: ${sighting.contact}`);
  lines.push('', `Todos los avisos de ${animal.name}: ${baseUrl}${petPath}`);

  await sendEmail(
    owner.email,
    `Han visto a ${animal.name}`,
    lines.join('\n'),
  );
}

export async function search(req: Request, res: Response) {
  const {
    q,
    species,
    size,
    sex,
    shelter,
    code,
    status,
    sort,
    dir,
    city,
    ageGroup,
    goodWithChildren,
    goodWithDogs,
    goodWithCats,
  } = req.query as Record<string, string>;
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '24'), 10) || 24));

  const filter: any = { createdByRole: { $in: ADOPTABLE_ROLES as unknown as string[] }, isPersonalPet: { $ne: true } };

  // Visibilidad: admin ve todo; la protectora dueña ve todos sus estados; el público solo los publicados.
  const user: any = (req as any).user;
  const isAdmin = user?.role === 'admin';
  const isOwnerView = shelter && user && String(user._id || user.id) === String(shelter);

  if (shelter) filter.shelter = shelter;

  if (isAdmin || isOwnerView) {
    if (status) filter.status = status;
  } else {
    filter.status = status && PUBLIC_STATUSES.includes(status) ? status : { $in: PUBLIC_STATUSES };
  }

  if (species) filter.species = speciesFilter(String(species));
  if (size) filter.size = size;
  if (sex) filter.sex = sex;
  if (ageGroup) filter.ageGroup = ageGroup;
  if (city) filter.city = new RegExp(String(city).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (goodWithChildren === 'true') filter.goodWithChildren = true;
  if (goodWithDogs === 'true') filter.goodWithDogs = true;
  if (goodWithCats === 'true') filter.goodWithCats = true;
  if (code) filter.code = String(code).trim().toUpperCase();
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { breed: rx }, { species: rx }, { description: rx }, { city: rx }];
  }

  // «Más cerca»: si sabemos desde dónde busca, ordena por distancia a cada animal.
  // Sin ubicación conocida sigue el orden normal y `origen: null` le dice a la web
  // que puede pedirla.
  if (sort === 'distance') {
    const origen = await origenBusqueda(req);
    if (origen) {
      const resultado = await buscarPorCercania(filter, origen, page, limit);
      const visibles = isAdmin || isOwnerView ? resultado.items : resultado.items.map(stripInternalFields);
      return res.json({ items: visibles, page, limit, total: resultado.total, origen: { etiqueta: origen.etiqueta, fuente: origen.fuente } });
    }
  }

  const sortField = sort === 'name' ? 'name' : sort === 'age' ? 'ageGroup' : 'createdAt';
  const sortDir = dir === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    Animal.find(filter)
      .sort({ [sortField]: sortDir })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Animal.countDocuments(filter),
  ]);

  // isAdmin/isOwnerView ya reflejan quién pidió la lista (ver arriba); para
  // cualquier otro visitante (el caso normal: el catálogo público) se retira
  // lo mismo que en `getById`/`getByCode` antes de que salga por la red.
  const sanitized = isAdmin || isOwnerView ? items : items.map(stripInternalFields);
  // La protectora ve quién tiene en casa cada animal en acogida (encontrado
  // por un particular): nombre, no el correo.
  if (isAdmin || isOwnerView) {
    const fosterIds = items.map((a: any) => a.foster?.userId).filter(Boolean);
    if (fosterIds.length) {
      const people = await User.find({ _id: { $in: fosterIds } }).select('name').lean();
      const nameOf = new Map(people.map((u: any) => [String(u._id), u.name]));
      for (const a of sanitized as any[]) if (a.foster?.userId) a.foster = { ...a.foster, name: nameOf.get(String(a.foster.userId)) || 'Particular' };
    }
  }

  res.json({ items: sanitized, page, limit, total, ...(sort === 'distance' ? { origen: null } : {}) });
}

type Origen = Lugar & { fuente: 'ubicacion' | 'texto' | 'perfil' };

/**
 * Desde dónde busca: coordenadas del navegador (`lat`/`lng`, redondeadas a ~1 km y
 * solo dentro de España), un código postal o municipio escrito (`near`) o, si ha
 * iniciado sesión, la dirección de su perfil. Nada de esto se guarda.
 */
async function origenBusqueda(req: Request): Promise<Origen | null> {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (req.query.lat !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && lat > 27 && lat < 44.5 && lng > -19 && lng < 5) {
    return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, etiqueta: 'tu ubicación', fuente: 'ubicacion' };
  }
  const cerca = typeof req.query.near === 'string' ? req.query.near.trim().slice(0, 80) : '';
  if (cerca) {
    const lugar = geolocalizar(cerca);
    return lugar ? { ...lugar, fuente: 'texto' } : null;
  }
  const user: any = (req as any).user;
  const id = user?._id || user?.id;
  if (id && Types.ObjectId.isValid(String(id))) {
    const yo: any = await User.findById(id).select('profile.address').lean();
    const lugar = geolocalizar(yo?.profile?.address?.city, yo?.profile?.address?.postalCode);
    if (lugar) return { ...lugar, fuente: 'perfil' };
  }
  return null;
}

/** Tope de animales que se ordenan en memoria: el catálogo publicado es mucho menor. */
const MAX_CERCANIA = 3000;

/**
 * Ordena por distancia. El lugar de cada animal sale de su ciudad y, si no se reconoce,
 * de la dirección de quien lo da: código postal en las protectoras y solo el municipio
 * en los particulares, para no acercar más de la cuenta dónde vive alguien. Los que no
 * tienen lugar reconocible van al final, del más reciente al más antiguo.
 */
async function buscarPorCercania(filter: any, origen: Lugar, page: number, limit: number) {
  const candidatos: any[] = await Animal.find(filter)
    .select('_id city shelter createdByRole createdAt')
    .sort({ createdAt: -1 })
    .limit(MAX_CERCANIA)
    .lean();
  const duenos = [...new Set(candidatos.map(a => String(a.shelter || '')).filter(Boolean))];
  const gente: any[] = duenos.length ? await User.find({ _id: { $in: duenos } }).select('profile.address').lean() : [];
  const direccion = new Map(gente.map(u => [String(u._id), u.profile?.address || {}]));

  const conDistancia = candidatos.map((a, orden) => {
    let lugar = geolocalizar(a.city);
    if (!lugar) {
      const dir: any = direccion.get(String(a.shelter || '')) || {};
      lugar = geolocalizar(dir.city, a.createdByRole === 'protectora' ? dir.postalCode : null);
    }
    return { id: String(a._id), orden, km: lugar ? distanciaKm(origen, lugar) : null };
  });
  conDistancia.sort((x, y) => {
    if (x.km === null && y.km === null) return x.orden - y.orden;
    if (x.km === null) return 1;
    if (y.km === null) return -1;
    return x.km - y.km || x.orden - y.orden;
  });

  const pagina = conDistancia.slice((page - 1) * limit, page * limit);
  const docs: any[] = pagina.length ? await Animal.find({ _id: { $in: pagina.map(p => p.id) } }).lean() : [];
  const porId = new Map(docs.map(d => [String(d._id), d]));
  const items = pagina
    .map(p => {
      const doc = porId.get(p.id);
      if (!doc) return null;
      // Kilómetros enteros (mínimo 1): suficiente para elegir y no delata calles.
      return { ...doc, distanceKm: p.km === null ? null : Math.max(1, Math.round(p.km)) };
    })
    .filter(Boolean);
  return { items, total: candidatos.length };
}

export async function updateStatus(req: Request, res: Response) {
  const { id } = req.params;
  const { status } = req.body as { status?: string };
  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }
  const animal = await Animal.findById(id);
  if (!animal) return res.status(404).json({ error: 'not_found' });
  const user: any = (req as any).user;
  if (!canManageAnimal(user, animal)) return res.status(403).json({ error: 'forbidden' });
  if (animal.status !== status && needsVerification(status) && !(await canPublishAnimals(user, String(animal.shelter)))) {
    return res.status(403).json({ error: 'shelter_verification_required' });
  }
  const previousStatus = animal.status;
  animal.status = status as any;
  await animal.save();
  if (previousStatus !== 'publicado' && animal.status === 'publicado') {
    notifyMatchingAlerts(animal.toObject()).catch(() => undefined);
  }
  res.json({ _id: animal._id, status: animal.status });
}

export async function remove(req: Request, res: Response) {
  const { id } = req.params;
  const user: any = (req as any).user || {};
  const a = await Animal.findById(id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  if (!canManageAnimal(user, a)) return res.status(403).json({ error: 'forbidden' });
  // Con una adopción en curso o aprobada no se borra, ni siquiera el admin:
  // primero hay que cancelarla o moverla.
  const activeAdoption = await Adoption.exists({
    animalId: String(a._id),
    status: { $in: ['preaprobada', 'cita_propuesta', 'aprobada'] },
  });
  if (activeAdoption) return res.status(409).json({ error: 'adoption_in_progress' });
  await Animal.deleteOne({ _id: a._id });
  res.json({ ok: true });
}

export async function createPersonal(req: Request, res: Response) {
  const user: any = (req as any).user;
  const userId = user?._id || user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const { name, species, age: rawAge, birthDate: rawBirth, images, mood, sex, size } = req.body as {
    name?: string;
    species?: string;
    age?: string;
    birthDate?: string;
    images?: string[];
    mood?: string;
    sex?: 'male' | 'female';
    size?: 'small' | 'medium' | 'large';
  };

  // La app manda la fecha de nacimiento; la edad en texto queda para clientes
  // viejos. Con fecha, la edad se calcula de ella.
  const birthDate = rawBirth !== undefined ? parseBirthDate(rawBirth) : null;
  if (rawBirth !== undefined && !birthDate) return res.status(400).json({ error: 'invalid_birth_date' });
  const age = birthDate ? ageFromBirthDate(birthDate) : rawAge;
  if (!name?.trim() || !species?.trim() || !age?.trim()) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const doc = await Animal.create({
    shelter: userId,
    ownerId: userId,
    isPersonalPet: true,
    createdByRole: 'tenant',
    name: name.trim(),
    species: species.trim(),
    age: age.trim(),
    birthDate: birthDate || undefined,
    images: Array.isArray(images) ? images : [],
    mood: mood || undefined,
    sex: sex || undefined,
    size: size || undefined,
    status: 'no_disponible',
  });

  await logAnimalEvent({
    animalId: String(doc._id), code: doc.code, type: 'created',
    actorId: String(userId), toOwnerId: String(userId), toOwnerType: 'tenant',
  });

  res.status(201).json(doc);
}

// PUT /api/animals/mine/:id — la familia corrige la ficha de su mascota, ya sea
// una que registró ella o una que adoptó (al aprobarse la adopción el animal
// pasa a `isPersonalPet` con `ownerId` del adoptante).
//
// No sirve `update`: exige rol landlord/admin y ser la protectora titular de la
// ficha, así que un tenant no podía ni cambiar la foto de su propio animal.
// Aquí manda `canManageAnimal` (shelter u ownerId), igual que en el modo perdido.
export async function updateMine(req: Request, res: Response) {
  const user: any = (req as any).user;
  const userId = user?._id || user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const animal: any = await Animal.findById(req.params.id);
  // Una ficha en adopción de una protectora no se edita por aquí: para eso está
  // `update`, con su control de publicación y de estados.
  if (!animal || animal.isPersonalPet !== true) return res.status(404).json({ error: 'not_found' });
  if (!canManageAnimal(user, animal)) return res.status(403).json({ error: 'forbidden' });

  // `personalPetUpdateSchema` ya ha dejado en el cuerpo solo campos editables.
  for (const [field, value] of Object.entries(req.body as Record<string, unknown>)) {
    if (field === 'birthDate') continue;
    animal[field] = value;
  }
  if ((req.body as any).birthDate !== undefined) {
    const birthDate = parseBirthDate((req.body as any).birthDate);
    if (!birthDate) return res.status(400).json({ error: 'invalid_birth_date' });
    animal.birthDate = birthDate;
    animal.age = ageFromBirthDate(birthDate);
  }
  await animal.save();

  // El código del pasaporte se genera de forma perezosa: si esta ficha es de
  // antes de los códigos, aprovechamos que ya la tenemos cargada.
  if (!animal.code) await ensureAnimalCode(animal);

  res.json(animal);
}

export async function listMine(req: Request, res: Response) {
  const user: any = (req as any).user;
  const userId = user?._id || user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const [personalDocs, adoptions] = await Promise.all([
    Animal.find({ ownerId: userId, isPersonalPet: true }),
    Adoption.find({ adopterId: userId, status: 'aprobada' }).lean(),
  ]);

  const personal = [] as any[];
  const personalIds = new Set<string>();
  for (const doc of personalDocs) {
    if (!doc.code) {
      await ensureAnimalCode(doc);
    }
    personalIds.add(String(doc._id));
    personal.push(doc.toObject());
  }

  const adoptionAnimalIds = adoptions.map(ad => String(ad.animalId || '')).filter(Boolean);
  const adoptionAnimals = adoptionAnimalIds.length
    ? await Animal.find({ _id: { $in: adoptionAnimalIds } })
    : [];
  const adoptionMap = new Map(adoptionAnimals.map(doc => [String(doc._id), doc]));
  const adopted: any[] = [];
  for (const adoption of adoptions) {
    if (!adoption.animalId) continue;
    const animalId = String(adoption.animalId);
    if (personalIds.has(animalId)) continue;
    const doc = adoptionMap.get(animalId);
    if (!doc) continue;
    if (!doc.code) {
      await ensureAnimalCode(doc);
    }
    adopted.push({ type: 'adopted', adoptionId: String(adoption._id), animal: doc.toObject() });
  }

  const items = [
    ...personal.map(animal => ({ type: 'personal', animal })),
    ...adopted,
  ];
  // Las que ya no están, al final: la primera es la que se elige al abrir la
  // app, y tiene que ser una que sigue en casa.
  const inMemory = (item: any) => (item.animal?.memorial?.active ? 1 : 0);
  items.sort((a, b) => inMemory(a) - inMemory(b));

  res.json({ items });
}
