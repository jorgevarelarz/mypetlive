import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Animal } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { User } from '../models/user.model';
import { CareLog, WALK_KINDS, type WalkKind } from '../models/careLog.model';
import { normalizeSpecies } from '../utils/species';
import {
  isSupplyUnit,
  toBase,
  unitFamily,
  supplyForecast,
  isRunningLow,
  type SupplyUnit,
} from '../utils/supplies';

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

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Anota en la despensa lo que se acaba de usar y **descuenta una ración** de lo
 * que queda, si ese producto tiene ración configurada.
 *
 * Lo usado sube al principio: es lo que hace que la segunda vez el producto ya
 * esté ahí para marcarlo de un toque, en vez de teclear la marca del pienso tres
 * veces al día. Los productos sin ración configurada siguen siendo solo un
 * nombre, que es como nació la despensa y como sigue funcionando para quien no
 * quiera llevar la cuenta.
 */
function consumeFromPantry(current: any[] | undefined, used: string[]): any[] {
  const list = [...(current || [])];
  const touched: any[] = [];

  for (const name of used) {
    const index = list.findIndex(item => sameName(String(item?.name || ''), name));
    if (index === -1) {
      touched.push({ name, updatedAt: new Date() });
      continue;
    }
    const [supply] = list.splice(index, 1);
    const doc = typeof supply?.toObject === 'function' ? supply.toObject() : { ...supply };
    if (doc.perUse > 0 && typeof doc.remaining === 'number') {
      // Nunca por debajo de cero: quedarse sin pienso es un hecho, no un número
      // negativo, y el aviso ya lo da `usesLeft: 0`.
      doc.remaining = Math.max(0, doc.remaining - doc.perUse);
    }
    doc.updatedAt = new Date();
    touched.push(doc);
  }

  return [...touched, ...list].slice(0, PANTRY_LIMIT);
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
    pantry.foods = consumeFromPantry(pantry.foods, foods);
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
    pantry.litters = consumeFromPantry(pantry.litters, [litterType]);
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

/**
 * Alta, edición o reposición de un producto de la despensa.
 *
 * Un solo endpoint para las tres cosas porque para quien lo usa son la misma:
 * "el pienso es este, el saco trae 6 kg y le pongo 80 g". Reponer es `refill`,
 * que devuelve lo que queda al tamaño del paquete — el gesto real es abrir uno
 * nuevo, no calcular cuánto había.
 */
export async function upsertSupply(req: Request, res: Response) {
  const { id } = req.params;
  const user: any = (req as any).user;
  const animal = await animalIfAllowed(id, user);
  if (!animal) return denyCare(res, id);

  const body = (req.body || {}) as Record<string, unknown>;
  const kind = String(body.kind || '');
  if (kind !== 'food' && kind !== 'litter') return res.status(400).json({ error: 'invalid_kind' });

  const name = cleanLabel(body.name);
  if (!name) return res.status(400).json({ error: 'name_required' });

  const pantry = ensurePantry(animal);
  const list: any[] = kind === 'food' ? pantry.foods || [] : pantry.litters || [];
  const index = list.findIndex(item => sameName(String(item?.name || ''), name));
  const existing = index === -1 ? null : (typeof list[index]?.toObject === 'function' ? list[index].toObject() : { ...list[index] });

  if (body.remove === true) {
    if (index === -1) return res.status(404).json({ error: 'supply_not_found' });
    list.splice(index, 1);
    if (kind === 'food') pantry.foods = list; else pantry.litters = list;
    await animal.save();
    return res.json({ ok: true, pantry: animal.carePantry });
  }

  const next: any = existing || { name };
  next.name = name;
  // `next` y `existing` son el mismo objeto, así que lo que queda AHORA hay que
  // guardarlo antes de tocarlo: es contra esto contra lo que se decide si hay
  // que rearmar el aviso de "se acaba".
  const previousRemaining: number = existing?.remaining ?? 0;

  // Las unidades del paquete y de la ración pueden ser distintas (saco en kg,
  // ración en gramos) pero tienen que ser de la misma magnitud: descontar 80 ml
  // de un saco de 6 kg no significa nada.
  const packUnit = body.packUnit ?? body.unit;
  const perUseUnit = body.perUseUnit ?? body.unit;

  if (body.packSize !== undefined && body.packSize !== null && body.packSize !== '') {
    if (!isSupplyUnit(packUnit)) return res.status(400).json({ error: 'invalid_unit' });
    const value = optionalNumber(body.packSize, { min: 0, max: 1_000_000 });
    if (value === null || value === undefined) return res.status(400).json({ error: 'invalid_pack_size' });
    next.packSize = toBase(value, packUnit as SupplyUnit);
    next.unit = packUnit;
  }

  if (body.perUse !== undefined && body.perUse !== null && body.perUse !== '') {
    if (!isSupplyUnit(perUseUnit)) return res.status(400).json({ error: 'invalid_unit' });
    const value = optionalNumber(body.perUse, { min: 0, max: 1_000_000 });
    if (value === null || value === undefined) return res.status(400).json({ error: 'invalid_per_use' });
    if (next.unit && unitFamily(next.unit as SupplyUnit) !== unitFamily(perUseUnit as SupplyUnit)) {
      return res.status(400).json({ error: 'unit_mismatch', unit: next.unit });
    }
    next.perUse = toBase(value, perUseUnit as SupplyUnit);
    if (!next.unit) next.unit = perUseUnit;
  }

  if (body.refill === true) {
    if (!next.packSize) return res.status(400).json({ error: 'pack_size_required' });
    next.remaining = next.packSize;
  } else if (body.remaining !== undefined && body.remaining !== null && body.remaining !== '') {
    const unit = body.remainingUnit ?? next.unit;
    if (!isSupplyUnit(unit)) return res.status(400).json({ error: 'invalid_unit' });
    const value = optionalNumber(body.remaining, { min: 0, max: 1_000_000 });
    if (value === null || value === undefined) return res.status(400).json({ error: 'invalid_remaining' });
    next.remaining = toBase(value, unit as SupplyUnit);
  } else if (existing === null && next.packSize) {
    // Producto nuevo con paquete y sin decir cuánto queda: se asume entero, que
    // es lo que pasa cuando se apunta al comprarlo.
    next.remaining = next.packSize;
  }

  // Reponer (o subir lo que queda a mano) rearma el aviso de "se acaba": si no,
  // se avisaría una sola vez en la vida de ese producto.
  // `delete` y no `= undefined`: al recastear el array, mongoose conserva el
  // valor anterior de una clave presente-pero-undefined y el aviso no se rearmaba.
  if (next.lowNotifiedAt && previousRemaining < (next.remaining ?? 0)) {
    delete next.lowNotifiedAt;
  }

  next.updatedAt = new Date();
  if (index === -1) list.unshift(next);
  else list[index] = next;

  if (kind === 'food') pantry.foods = list.slice(0, PANTRY_LIMIT);
  else pantry.litters = list.slice(0, PANTRY_LIMIT);
  await animal.save();

  res.json({ ok: true, pantry: animal.carePantry });
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

  // Ritmo real de consumo de cada producto, sacado del propio registro: cuántas
  // veces se ha usado en la semana, repartido entre siete. No hay que declarar
  // "come dos veces al día" en ningún sitio, y si alguien cambia de pauta el
  // cálculo la sigue solo.
  const usesPerDayOf = (kind: 'food' | 'litter', name: string) => {
    const uses = week.filter(entry =>
      kind === 'food'
        ? entry.type === 'feed' && (entry.foods || []).some(f => f.trim().toLowerCase() === name.trim().toLowerCase())
        : entry.type === 'litter' && (entry.litterType || '').trim().toLowerCase() === name.trim().toLowerCase(),
    ).length;
    return uses > 0 ? uses / 7 : undefined;
  };

  const withForecast = (kind: 'food' | 'litter') => (supply: any) => {
    const plain = typeof supply?.toObject === 'function' ? supply.toObject() : { ...supply };
    const forecast = supplyForecast(plain, usesPerDayOf(kind, String(plain.name || '')));
    return { ...plain, ...forecast, runningLow: isRunningLow(forecast) };
  };

  const pantry = animal.carePantry || ({ foods: [], litters: [] } as any);

  res.json({
    items,
    summary,
    pantry: {
      foods: (pantry.foods || []).map(withForecast('food')),
      litters: (pantry.litters || []).map(withForecast('litter')),
    },
    last: {
      feeding: animal.lastFeeding,
      litterChange: animal.lastLitterChange,
      walk: animal.lastWalk,
    },
  });
}
