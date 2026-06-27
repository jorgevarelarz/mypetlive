import { Request, Response } from 'express';
import { Animal, ensureAnimalCode } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { AnimalAlert } from '../models/animalAlert.model';
import { User } from '../models/user.model';
import { sendEmail } from '../utils/notification';
import { logAnimalEvent } from '../utils/animalEvents';
import { AnimalEvent } from '../models/animalEvent.model';

const allowedStatuses = ['borrador', 'publicado', 'reservado', 'preadoptado', 'adoptado', 'no_disponible', 'archivado'];

function matchesAlert(animal: any, filters: Record<string, any>) {
  for (const key of ['species', 'size', 'sex', 'ageGroup', 'goodWithChildren', 'goodWithDogs', 'goodWithCats']) {
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
  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://test.valerisstudio.es';
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

// GET /api/animals/passport/:code — público (sin datos personales del dueño actual).
export async function getPassport(req: Request, res: Response) {
  const normalized = String(req.params.code || '').trim().toUpperCase();
  if (!normalized) return res.status(400).json({ error: 'invalid_code' });
  const animal: any = await Animal.findOne({ code: normalized }).lean();
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
    timeline: buildTimeline(animal, events, false),
  });
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
