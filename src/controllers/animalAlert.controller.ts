import { Request, Response } from 'express';
import { Animal } from '../models/animal.model';
import { AnimalAlert } from '../models/animalAlert.model';
import { getUserId } from '../utils/getUserId';
import { speciesVariants } from '../utils/species';

const PUBLIC_STATUSES = ['publicado', 'reservado', 'preadoptado'];
const allowedKeys = [
  'q',
  'species',
  'size',
  'sex',
  'city',
  'ageGroup',
  'goodWithChildren',
  'goodWithDogs',
  'goodWithCats',
] as const;

function cleanFilters(input: any) {
  const filters: Record<string, string | boolean> = {};
  for (const key of allowedKeys) {
    const value = input?.[key];
    if (typeof value === 'boolean') filters[key] = value;
    if (typeof value === 'string' && value.trim()) filters[key] = value.trim();
  }
  return filters;
}

function buildFilter(filters: Record<string, any>) {
  const query: any = {
    createdByRole: 'protectora',
    isPersonalPet: { $ne: true },
    status: { $in: PUBLIC_STATUSES },
  };
  // La especie se guarda canonizada (gato→cat): casar por variantes es/en.
  if (filters.species !== undefined) query.species = { $in: speciesVariants(filters.species) };
  for (const key of ['size', 'sex', 'ageGroup', 'goodWithChildren', 'goodWithDogs', 'goodWithCats']) {
    if (filters[key] !== undefined) query[key] = filters[key];
  }
  if (filters.city) query.city = new RegExp(filters.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (filters.q) {
    const rx = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: rx }, { breed: rx }, { species: rx }, { description: rx }, { city: rx }];
  }
  return query;
}

async function serialize(alert: any) {
  const filters = alert.filters?.toObject?.() || alert.filters || {};
  const matches = await Animal.countDocuments(buildFilter(filters));
  return { ...alert.toObject(), matches };
}

export async function list(req: Request, res: Response) {
  const userId = getUserId(req);
  const alerts = await AnimalAlert.find({ userId }).sort({ createdAt: -1 });
  res.json({ items: await Promise.all(alerts.map(serialize)) });
}

export async function create(req: Request, res: Response) {
  const userId = getUserId(req);
  const filters = cleanFilters(req.body?.filters);
  if (!Object.keys(filters).length) return res.status(400).json({ error: 'filters_required' });
  const alert = await AnimalAlert.create({ userId, filters, active: true });
  res.status(201).json(await serialize(alert));
}

export async function update(req: Request, res: Response) {
  const userId = getUserId(req);
  const update: any = {};
  if (typeof req.body?.active === 'boolean') update.active = req.body.active;
  if (req.body?.filters) update.filters = cleanFilters(req.body.filters);
  const alert = await AnimalAlert.findOneAndUpdate({ _id: req.params.id, userId }, update, { new: true });
  if (!alert) return res.status(404).json({ error: 'not_found' });
  res.json(await serialize(alert));
}

export async function remove(req: Request, res: Response) {
  const userId = getUserId(req);
  const result = await AnimalAlert.deleteOne({ _id: req.params.id, userId });
  if (!result.deletedCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
}
