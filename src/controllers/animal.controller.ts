import { Request, Response } from 'express';
import { Animal, ensureAnimalCode } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { AnimalAlert } from '../models/animalAlert.model';
import { User } from '../models/user.model';
import { sendEmail } from '../utils/notification';
import { logAnimalEvent } from '../utils/animalEvents';
import { AnimalEvent } from '../models/animalEvent.model';
import { speciesVariants } from '../utils/species';
import { canPublishAnimals } from '../utils/shelterVerification';
import { canManageAnimal } from '../utils/animalAccess';

const allowedStatuses = ['borrador', 'publicado', 'reservado', 'preadoptado', 'adoptado', 'no_disponible', 'archivado'];

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
  await Promise.allSettled(users.map(user => sendEmail(
    user.email,
    `Nuevo compañero compatible: ${animal.name}`,
    `Hola ${user.name || ''}, ${animal.name} coincide con una de tus alertas de MyPetLive. Puedes conocerlo aquí: ${baseUrl}/animals/${animal._id}`,
  )));
}

export async function create(req: Request, res: Response) {
  const b: any = req.body || {};
  // Si no viene, por defecto asignamos la protectora actual
  if (!b.shelter) {
    const u: any = (req as any).user;
    if (u?._id || u?.id) b.shelter = String(u._id || u.id);
  }
  if (b.status === 'publicado' && !(await canPublishAnimals((req as any).user, String(b.shelter || '')))) {
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
  const isAdmin = user?.role === 'admin';
  const isOwner = user && String(current.shelter) === String(user._id || user.id);
  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const payload = { ...req.body };
  // Proteger el campo shelter/owner frente a cambios arbitrarios
  delete (payload as any).shelter;
  delete (payload as any).ownerId;

  if (current.status !== 'publicado' && payload.status === 'publicado' && !(await canPublishAnimals(user, String(current.shelter)))) {
    return res.status(403).json({ error: 'shelter_verification_required' });
  }

  const updated = await Animal.findByIdAndUpdate(id, payload, { new: true });
  if (current.status !== 'publicado' && updated?.status === 'publicado') {
    notifyMatchingAlerts(updated.toObject()).catch(() => undefined);
  }
  res.json(updated);
}

export async function getById(req: Request, res: Response) {
  const a = await Animal.findById(req.params.id).populate('shelter', 'name email');
  if (!a) return res.status(404).json({ error: 'not_found' });
  if (a.isPersonalPet === true) return res.status(404).json({ error: 'not_found' });
  if (a.createdByRole !== 'protectora') return res.status(404).json({ error: 'not_found' });
  if (!a.code) await ensureAnimalCode(a);
  res.json(a);
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
  if (animal.createdByRole !== 'protectora') return res.status(404).json({ error: 'not_found' });
  if (!animal.code) await ensureAnimalCode(animal);
  res.json(animal);
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
export async function getPassport(req: Request, res: Response) {
  const normalized = String(req.params.code || '').trim().toUpperCase();
  if (!normalized) return res.status(400).json({ error: 'invalid_code' });
  const animal: any = await Animal.findOne({ code: normalized, status: { $ne: 'borrador' } }).lean();
  if (!animal) return res.status(404).json({ error: 'not_found' });

  const shelter: any = animal.shelter ? await User.findById(animal.shelter).select('name profile.address.city').lean() : null;
  const events = await AnimalEvent.find({ animalId: animal._id })
    .sort({ createdAt: 1 })
    .populate('shelterId', 'name')
    .lean();

  const vetCount = (animal.vetHistory || []).length;
  const healthCount = (animal.healthHistory || []).length;

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
    provenance: shelter ? { shelterName: shelter.name, city: shelter.profile?.address?.city || animal.city } : null,
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
      }
      : { isLost: false },
    timeline: buildTimeline(animal, events, false),
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

  // Volver a marcar perdido un animal ya perdido actualiza la zona pero no
  // reinicia el reloj: "perdido desde hace 3 días" es lo que mueve a la gente.
  const since = animal.lost?.isLost && animal.lost?.since ? animal.lost.since : new Date();

  animal.lost = {
    isLost: true,
    since,
    area,
    notes,
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

  res.json({ ok: true, lost: { isLost: true, since, area, notes } });
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
  const owner: any = await User.findById(ownerId).select('email name').lean();
  if (!owner?.email) return;

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
  lines.push('', `Todos los avisos de ${animal.name}: ${baseUrl}/pets/${animal._id}`);

  await sendEmail(
    owner.email,
    `Han visto a ${animal.name}`,
    lines.join('\n'),
  );
}

const PUBLIC_STATUSES = ['publicado', 'reservado', 'preadoptado'];

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

  const filter: any = { createdByRole: 'protectora', isPersonalPet: { $ne: true } };

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

  if (species) filter.species = species;
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

  res.json({ items, page, limit, total });
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
  const isOwner = user?.role === 'admin' || String(animal.shelter) === String(user?._id || user?.id);
  if (!isOwner) return res.status(403).json({ error: 'forbidden' });
  if (animal.status !== 'publicado' && status === 'publicado' && !(await canPublishAnimals(user, String(animal.shelter)))) {
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
  const isAdmin = user?.role === 'admin';
  const a = await Animal.findById(id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  const isOwner = String(a.shelter) === String(user?._id || user?.id);
  if (!isAdmin && !isOwner) return res.status(403).json({ error: 'forbidden' });
  await Animal.deleteOne({ _id: a._id });
  res.json({ ok: true });
}

export async function createPersonal(req: Request, res: Response) {
  const user: any = (req as any).user;
  const userId = user?._id || user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const { name, species, age, images, mood, sex, size } = req.body as {
    name?: string;
    species?: string;
    age?: string;
    images?: string[];
    mood?: string;
    sex?: 'male' | 'female';
    size?: 'small' | 'medium' | 'large';
  };

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
    animal[field] = value;
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

  res.json({ items });
}
