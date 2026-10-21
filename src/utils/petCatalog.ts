import { PetProduct } from '../models/petProduct.model';
import { normalizeSpecies } from './species';

/** Clave para buscar y no duplicar: «Royal Canin  Indoor» → «royal canin indoor». */
export function catalogKey(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ+&' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Sugerencias para el autocompletado: todas las palabras escritas tienen que
 * aparecer (en cualquier orden) y van primero las más usadas. Si se indica la
 * especie, entran las de esa especie y las que no tienen ninguna.
 */
export async function searchPetProducts(q: string, kind: 'food' | 'litter', species?: string, limit = 10) {
  const words = catalogKey(q).split(' ').filter(w => w.length >= 2).slice(0, 5);
  const filter: any = { kind };
  if (words.length) filter.$and = words.map(w => ({ key: { $regex: escape(w) } }));
  // Sin texto se sugiere lo nuestro y lo que apunta la gente: Open Pet Food
  // Facts trae nombres de fabricante o códigos sueltos que no sirven de entrada.
  else filter.source = { $in: ['seed', 'user', 'store'] };
  const sp = normalizeSpecies(species);
  if (sp) filter.$or = [{ species: sp }, { species: { $size: 0 } }];
  return PetProduct.find(filter).sort({ uses: -1, name: 1 }).limit(limit).select('name brand species uses').lean();
}

/**
 * Lo que alguien apunta (comida marcada, arena, despensa) se suma al catálogo:
 * si ya estaba, cuenta un uso más; si no, entra como producto de usuario.
 * No debe romper nunca el guardado del cuidado: los errores se tragan.
 */
export async function recordProductUse(names: string[], kind: 'food' | 'litter', species?: string) {
  const sp = normalizeSpecies(species);
  for (const name of names) {
    const key = catalogKey(name);
    if (!key || key.length < 2) continue;
    try {
      await PetProduct.updateOne(
        { kind, key },
        {
          $inc: { uses: 1 },
          $setOnInsert: { name: name.trim().slice(0, 140), source: 'user', species: sp ? [sp] : [] },
        },
        { upsert: true },
      );
    } catch {
      // Carrera entre dos altas iguales (índice único): el otro ya lo ha creado.
    }
  }
}
