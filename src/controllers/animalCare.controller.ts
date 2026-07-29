import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Animal } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { User } from '../models/user.model';
import { CareLog, WALK_KINDS, type WalkKind } from '../models/careLog.model';
import { normalizeSpecies } from '../utils/species';

/**
 * Devuelve el animal si esta persona puede registrar su cuidado, o null.
 *
 * Devuelve el documento —no un booleano— porque quien marca comida necesita
 * después la especie y la despensa: antes eran dos consultas para lo mismo.
 */
async function animalIfAllowed(animalId: string, user: any) {
  if (!user) return null;
  if (!Types.ObjectId.isValid(animalId)) return null;
  const animal = await Animal.findById(animalId);
  if (!animal) return null;
  if (user.role === 'admin') return animal;
  const userId = String(user._id || user.id);
  if ((user.role === 'landlord' || user.role === 'protectora') && String(animal.shelter) === userId) return animal;
  // Mascota personal: su dueño es `ownerId` y no hay adopción de por medio, así que
  // sin esta comprobación el propio dueño recibía 403 al marcar comida/arena.
  if (animal.ownerId && String(animal.ownerId) === userId) return animal;
  if (user.role === 'tenant') {
    // Estado real de `AdoptionStatus`: 'aprobada'. Se comparaba con 'accepted'
    // (legado de alquiler), que nunca casaba → el adoptante no podía cuidar
    // del animal que había adoptado.
    const adoption = await Adoption.findOne({ animalId: String(animalId), adopterId: userId, status: 'aprobada' });
    if (adoption) return animal;
  }
  return null;
}

/** 404 si el animal no existe, 403 si existe y no es cosa de esta persona. */
async function denyCare(res: Response, animalId: string) {
  const exists = Types.ObjectId.isValid(animalId) && (await Animal.exists({ _id: animalId }));
  return exists ? res.status(403).json({ error: 'forbidden' }) : res.status(404).json({ error: 'not_found' });
}

const PANTRY_LIMIT = 8;

/** Texto de producto: recortado, sin espacios de más y con tope de longitud. */
function cleanLabel(value: unknown, maxLength = 80): string | undefined {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return undefined;
  return text.slice(0, maxLength);
}

/**
 * Guarda en la despensa del animal lo que se acaba de usar, lo más reciente
 * primero y sin duplicados (ignorando mayúsculas). Es lo que hace que la segunda
 * vez el producto ya esté ahí para marcarlo de un toque, en vez de teclear la
 * marca del pienso tres veces al día.
 */
function rememberInPantry(current: string[] | undefined, used: string[]): string[] {
  const out = [...used];
  for (const item of current || []) {
    if (!out.some(v => v.toLowerCase() === item.toLowerCase())) out.push(item);
  }
  return out.slice(0, PANTRY_LIMIT);
}

/** Quién lo marcó, congelado en el registro: con voluntarios turnándose importa. */
async function actorNameOf(user: any): Promise<string | undefined> {
  if (user?.name) return String(user.name).slice(0, 120);
  const id = user?._id || user?.id;
  if (!id || !Types.ObjectId.isValid(String(id))) return undefined;
  const found = await User.findById(id).select('name').lean();
  return found?.name ? String(found.name).slice(0, 120) : undefined;
}

function ensurePantry(animal: any) {
  if (!animal.carePantry) animal.carePantry = { foods: [], litters: [] };
  return animal.carePantry;
}

export async function markFeeding(req: Request, res: Response) {
  const { id } = req.params;
  const user: any = (req as any).user;
  const animal = await animalIfAllowed(id, user);
  if (!animal) return denyCare(res, id);

  // Hasta dos productos: es lo que se da de verdad (el pienso y una lata), y más
  // de dos convierte marcar la comida en rellenar un formulario.
  const raw = Array.isArray((req.body || {}).foods) ? (req.body as any).foods : [];
  const foods: string[] = [];
  for (const value of raw) {
    const label = cleanLabel(value);
    if (label && !foods.some(f => f.toLowerCase() === label.toLowerCase())) foods.push(label);
    if (foods.length === 2) break;
  }

  const at = new Date();
  animal.lastFeeding = at;
  if (foods.length) {
    const pantry = ensurePantry(animal);
    pantry.foods = rememberInPantry(pantry.foods, foods);
  }
  await animal.save();

  const entry = await CareLog.create({
    animalId: animal._id,
    type: 'feed',
    actorId: user?._id || user?.id,
    actorName: await actorNameOf(user),
    ...(foods.length ? { foods } : {}),
  });

  res.json({ ok: true, lastFeeding: at, entry, pantry: animal.carePantry });
}

export async function markLitter(req: Request, res: Response) {
  const { id } = req.params;
  const user: any = (req as any).user;
  const animal = await animalIfAllowed(id, user);
  if (!animal) return denyCare(res, id);

  // Un perro no usa arenero. El resto de especies sí puede —un conejo lo usa—,
  // así que solo se bloquea lo que seguro está mal.
  if (normalizeSpecies(animal.species) === 'dog') {
    return res.status(400).json({ error: 'litter_not_applicable', species: animal.species });
  }

  const litterType = cleanLabel((req.body || {}).litterType);

  const at = new Date();
  animal.lastLitterChange = at;
  if (litterType) {
    const pantry = ensurePantry(animal);
    pantry.litters = rememberInPantry(pantry.litters, [litterType]);
  }
  await animal.save();

  const entry = await CareLog.create({
    animalId: animal._id,
    type: 'litter',
    actorId: user?._id || user?.id,
    actorName: await actorNameOf(user),
    ...(litterType ? { litterType } : {}),
  });

  res.json({ ok: true, lastLitterChange: at, entry, pantry: animal.carePantry });
}

/** Número opcional dentro de rango. `null` significa "lo han enviado mal". */
function optionalNumber(value: unknown, { min, max }: { min: number; max: number }): number | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return num;
}

export async function markWalk(req: Request, res: Response) {
  const { id } = req.params;
  const user: any = (req as any).user;
  const animal = await animalIfAllowed(id, user);
  if (!animal) return denyCare(res, id);

  if (normalizeSpecies(animal.species) === 'cat') {
    return res.status(400).json({ error: 'walk_not_applicable', species: animal.species });
  }

  const { kind, minutes, distanceKm, place } = (req.body || {}) as Record<string, unknown>;

  // El tipo de paseo es lo único obligatorio: es la parte que siempre se sabe y
  // la que da sentido al resto. Minutos, distancia y lugar pueden faltar; un
  // paseo registrado a medias vale más que un paseo sin registrar.
  if (!WALK_KINDS.includes(String(kind) as WalkKind)) {
    return res.status(400).json({ error: 'walk_kind_required', allowed: WALK_KINDS });
  }

  const parsedMinutes = optionalNumber(minutes, { min: 1, max: 1440 });
  const parsedDistance = optionalNumber(distanceKm, { min: 0, max: 100 });
  if (parsedMinutes === null) return res.status(400).json({ error: 'invalid_minutes', min: 1, max: 1440 });
  if (parsedDistance === null) return res.status(400).json({ error: 'invalid_distance', min: 0, max: 100 });

  const at = new Date();
  animal.lastWalk = at;
  await animal.save();

  const entry = await CareLog.create({
    animalId: animal._id,
    type: 'walk',
    actorId: user?._id || user?.id,
    actorName: await actorNameOf(user),
    walk: {
      kind: String(kind) as WalkKind,
      ...(parsedMinutes !== undefined ? { minutes: parsedMinutes } : {}),
      ...(parsedDistance !== undefined ? { distanceKm: parsedDistance } : {}),
      ...(cleanLabel(place, 120) ? { place: cleanLabel(place, 120) } : {}),
    },
  });

  res.json({ ok: true, lastWalk: at, entry });
}

const WEEK_MS = 7 * 24 * 3_600_000;

/**
 * Últimos registros y resumen de la semana.
 *
 * Es lo que da sentido a apuntar distancia y minutos: sueltos no dicen nada,
 * sumados sí.
 */
export async function listCare(req: Request, res: Response) {
  const { id } = req.params;
  const user: any = (req as any).user;
  const animal = await animalIfAllowed(id, user);
  if (!animal) return denyCare(res, id);

  const since = new Date(Date.now() - WEEK_MS);
  const [items, week] = await Promise.all([
    CareLog.find({ animalId: animal._id }).sort({ createdAt: -1 }).limit(20).lean(),
    CareLog.find({ animalId: animal._id, createdAt: { $gte: since } }).lean(),
  ]);

  const walks = week.filter(e => e.type === 'walk');
  const summary = {
    feedings: week.filter(e => e.type === 'feed').length,
    litterChanges: week.filter(e => e.type === 'litter').length,
    walks: walks.length,
    // Redondeo a un decimal: sumar flotantes da 11.399999999999999 y eso acaba
    // impreso tal cual en la tarjeta.
    walkKm: Math.round(walks.reduce((acc, e) => acc + (e.walk?.distanceKm || 0), 0) * 10) / 10,
    walkMinutes: walks.reduce((acc, e) => acc + (e.walk?.minutes || 0), 0),
  };

  res.json({
    items,
    summary,
    pantry: animal.carePantry || { foods: [], litters: [] },
    last: {
      feeding: animal.lastFeeding,
      litterChange: animal.lastLitterChange,
      walk: animal.lastWalk,
    },
  });
}
