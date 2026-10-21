/**
 * Carga inicial del catálogo de comida y arena (PetProduct).
 *
 *   node dist/scripts/seedPetProducts.js          (dentro del contenedor api)
 *
 * 1. Marcas y tipos hechos a mano (lo que de verdad se vende en España).
 * 2. Open Pet Food Facts: productos vendidos en España (base abierta, ODbL).
 *
 * Es idempotente: vuelve a pasar sin duplicar (clave kind+key) y nunca pisa
 * lo que ya existe ni el contador de usos.
 */
import mongoose from 'mongoose';
import { PetProduct } from '../models/petProduct.model';
import { catalogKey } from '../utils/petCatalog';

type Seed = { kind: 'food' | 'litter'; name: string; brand?: string; species?: string[] };

const FOOD_BRANDS: Array<[string, string[]]> = [
  ['Royal Canin', []], ["Hill's Science Plan", []], ["Hill's Prescription Diet", []],
  ['Purina Pro Plan', []], ['Purina ONE', []], ['Purina Dog Chow', ['dog']], ['Purina Cat Chow', ['cat']],
  ['Friskies', []], ['Felix', ['cat']], ['Gourmet', ['cat']], ['Beyond', []],
  ['Advance', []], ['Ultima', []], ['Acana', []], ['Orijen', []], ['Brit Care', []], ['Brit Premium', []],
  ['Lenda', []], ['Ownat', []], ['Natural Greatness', []], ['Edgard & Cooper', []], ['Taste of the Wild', []],
  ['Whiskas', ['cat']], ['Sheba', ['cat']], ['Pedigree', ['dog']], ['Cesar', ['dog']], ['Dingo', ['dog']],
  ['Applaws', []], ['Almo Nature', []], ['Josera', []], ['Wolf of Wilderness', []], ['Farmina N&D', []],
  ['Eukanuba', []], ['Iams', []], ['Monge', []], ['Vitakraft', []], ['Trixie', []], ['Calibra', []],
  ['Compy (Mercadona)', []], ['Delikuit (Mercadona)', []], ['Carrefour Companino', []], ['Coshida (Lidl)', []],
  ['Kiwoko Natural', []], ['Tiendanimal Criadores', []], ['Visán', []], ['Arquivet', []],
  ['Versele-Laga', ['rabbit', 'bird']], ['Oxbow', ['rabbit']], ['Cunipic', ['rabbit']], ['Prestige', ['bird']],
  ['Exo Terra', ['reptile']], ['Tetra', []],
];

const FOOD_TYPES: Seed[] = [
  { kind: 'food', name: 'Pienso' },
  { kind: 'food', name: 'Comida húmeda (lata)' },
  { kind: 'food', name: 'Comida húmeda (sobre)' },
  { kind: 'food', name: 'Premios / snacks' },
  { kind: 'food', name: 'Comida casera' },
  { kind: 'food', name: 'Comida cruda (BARF)' },
  { kind: 'food', name: 'Heno', species: ['rabbit'] },
  { kind: 'food', name: 'Pellets para conejo', species: ['rabbit'] },
  { kind: 'food', name: 'Verdura fresca', species: ['rabbit', 'reptile'] },
  { kind: 'food', name: 'Mezcla de semillas', species: ['bird'] },
  { kind: 'food', name: 'Insectos vivos (grillos, tenebrios)', species: ['reptile'] },
];

const LITTERS: Seed[] = [
  { kind: 'litter', name: 'Arena aglomerante' },
  { kind: 'litter', name: 'Arena de sílice' },
  { kind: 'litter', name: 'Arena vegetal (tofu)' },
  { kind: 'litter', name: 'Arena de pellets de madera' },
  { kind: 'litter', name: 'Arena de papel reciclado' },
  { kind: 'litter', name: 'Arena absorbente (sepiolita)' },
  { kind: 'litter', name: 'Arena de maíz' },
  { kind: 'litter', name: "Cat's Best", brand: "Cat's Best" },
  { kind: 'litter', name: 'Catsan', brand: 'Catsan' },
  { kind: 'litter', name: 'Sanicat', brand: 'Sanicat' },
  { kind: 'litter', name: 'Ever Clean', brand: 'Ever Clean' },
  { kind: 'litter', name: 'Compy arena (Mercadona)', brand: 'Compy' },
  { kind: 'litter', name: 'Lecho de virutas', species: ['rabbit'] },
  { kind: 'litter', name: 'Lecho de cáñamo', species: ['rabbit'] },
];

async function upsert(doc: Seed & { source: 'seed' | 'opff'; barcode?: string; imageUrl?: string; ingredients?: string; nutrition?: any }) {
  const key = catalogKey(doc.name);
  if (!key) return false;
  const res = await PetProduct.updateOne(
    { kind: doc.kind, key },
    {
      $setOnInsert: {
        kind: doc.kind, key, name: doc.name.slice(0, 140), brand: doc.brand, species: doc.species || [],
        source: doc.source, uses: 0,
        ...(doc.barcode ? { barcode: doc.barcode } : {}),
        ...(doc.imageUrl ? { imageUrl: doc.imageUrl } : {}),
        ...(doc.ingredients ? { ingredients: doc.ingredients.slice(0, 4000) } : {}),
        ...(doc.nutrition ? { nutrition: doc.nutrition } : {}),
      },
    },
    { upsert: true },
  ).catch(() => null);
  return Boolean(res?.upsertedCount);
}

function speciesFromCategories(tags: string[] = []): string[] {
  const out = new Set<string>();
  for (const t of tags) {
    if (/cat-food|cat-treat|for-cats/.test(t)) out.add('cat');
    if (/dog-food|dog-treat|for-dogs/.test(t)) out.add('dog');
    if (/rabbit|rodent/.test(t)) out.add('rabbit');
    if (/bird/.test(t)) out.add('bird');
  }
  return Array.from(out);
}

async function loadOpenPetFoodFacts() {
  const fields = 'code,product_name,product_name_es,brands,categories_tags,image_front_small_url,ingredients_text_es,ingredients_text,nutriments';
  let added = 0;
  for (let page = 1; page <= 40; page++) {
    const url = `https://world.openpetfoodfacts.org/api/v2/search?countries_tags_en=spain&page_size=100&page=${page}&fields=${fields}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'MyPetLive/1.0 (info@mypetlive.es)' } });
    if (!res.ok) { console.log(`OPFF página ${page}: HTTP ${res.status}`); break; }
    const body: any = await res.json();
    const products: any[] = body.products || [];
    if (!products.length) break;
    for (const p of products) {
      const title = String(p.product_name_es || p.product_name || '').trim();
      // Sin nombre, o con un código de barras por nombre, no sirve para sugerir.
      if (!title || /^[\d\s-]+$/.test(title) || title.length < 3) continue;
      const brand = String(p.brands || '').split(',')[0].trim();
      const name = brand && !title.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${title}` : title;
      const tags: string[] = p.categories_tags || [];
      const kind: 'food' | 'litter' = tags.some(t => /litter/.test(t)) ? 'litter' : 'food';
      const n = p.nutriments || {};
      const nutrition = (n.proteins_100g ?? n.fat_100g ?? n.fiber_100g) !== undefined
        ? { protein: n.proteins_100g, fat: n.fat_100g, fiber: n.fiber_100g } : undefined;
      if (await upsert({
        kind, name, brand: brand || undefined, species: speciesFromCategories(tags), source: 'opff',
        barcode: p.code ? String(p.code) : undefined, imageUrl: p.image_front_small_url,
        ingredients: p.ingredients_text_es || p.ingredients_text, nutrition,
      })) added++;
    }
    console.log(`OPFF página ${page}: ${products.length} productos, ${added} nuevos en total`);
    await new Promise(r => setTimeout(r, 800)); // ser amables con su API
  }
  return added;
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) throw new Error('Falta MONGO_URI');
  await mongoose.connect(uri);
  await PetProduct.syncIndexes();
  let seeded = 0;
  for (const [brand, species] of FOOD_BRANDS) if (await upsert({ kind: 'food', name: brand, brand, species, source: 'seed' })) seeded++;
  for (const s of [...FOOD_TYPES, ...LITTERS]) if (await upsert({ ...s, source: 'seed' })) seeded++;
  console.log(`Lista propia: ${seeded} nuevos`);
  const fromOpff = await loadOpenPetFoodFacts();
  console.log(`Open Pet Food Facts: ${fromOpff} nuevos`);
  console.log(`Total en el catálogo: ${await PetProduct.countDocuments()}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
