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

const OPFF_FIELDS = 'code,product_name,product_name_es,brands,categories_tags,image_front_small_url,ingredients_text_es,ingredients_text,nutriments';

/**
 * Producto por código de barras (lector de la app): primero nuestro catálogo;
 * si no está, Open Pet Food Facts, y lo que encuentre se queda guardado. Null
 * si nadie lo conoce: la app pide el nombre y lo enseña con `teachBarcode`.
 */
export async function findByBarcode(code: string) {
  const barcode = String(code || '').replace(/\D/g, '');
  if (barcode.length < 6 || barcode.length > 14) return null;
  const known = await PetProduct.findOne({ barcode }).select('name kind brand').lean();
  if (known) return known;
  try {
    const res = await fetch(`https://world.openpetfoodfacts.org/api/v2/product/${barcode}?fields=${OPFF_FIELDS}`, {
      headers: { 'User-Agent': 'MyPetLive/1.0 (info@mypetlive.es)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body: any = await res.json();
    const p = body?.product;
    const title = String(p?.product_name_es || p?.product_name || '').trim();
    if (!p || !title || /^[\d\s-]+$/.test(title)) return null;
    const brand = String(p.brands || '').split(',')[0].trim();
    const name = brand && !title.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${title}` : title;
    const tags: string[] = p.categories_tags || [];
    const kind: 'food' | 'litter' = tags.some(t => /litter/.test(t)) ? 'litter' : 'food';
    const key = catalogKey(name);
    // Si ya existía por nombre (sin código), se le añade el código.
    const doc = await PetProduct.findOneAndUpdate(
      { kind, key },
      {
        $set: { barcode },
        $setOnInsert: {
          kind, key, name: name.slice(0, 140), brand: brand || undefined, species: [], source: 'opff', uses: 0,
          imageUrl: p.image_front_small_url, ingredients: (p.ingredients_text_es || p.ingredients_text || '').slice(0, 4000) || undefined,
        },
      },
      { upsert: true, new: true },
    ).select('name kind brand').lean();
    return doc;
  } catch {
    return null;
  }
}

/** La persona escribe el nombre de un código que nadie conocía: queda aprendido. */
export async function teachBarcode(code: string, name: string, kind: 'food' | 'litter', species?: string) {
  const barcode = String(code || '').replace(/\D/g, '');
  const key = catalogKey(name);
  if (barcode.length < 6 || barcode.length > 14 || !key) return null;
  if (await PetProduct.exists({ barcode })) return PetProduct.findOne({ barcode }).select('name kind brand').lean();
  const sp = normalizeSpecies(species);
  return PetProduct.findOneAndUpdate(
    { kind, key },
    { $set: { barcode }, $setOnInsert: { kind, key, name: name.trim().slice(0, 140), source: 'user', species: sp ? [sp] : [], uses: 0 } },
    { upsert: true, new: true },
  ).select('name kind brand').lean();
}
