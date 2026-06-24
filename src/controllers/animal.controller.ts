import { Request, Response } from 'express';
import { Animal, ensureAnimalCode } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { AnimalAlert } from '../models/animalAlert.model';
import { User } from '../models/user.model';
import { sendEmail } from '../utils/notification';

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
