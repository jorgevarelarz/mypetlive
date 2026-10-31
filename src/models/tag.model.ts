import { randomInt } from 'crypto';
import { Schema, model } from 'mongoose';

// ---------------------------------------------------------------------------
// Chapa física (QR grabado en el collar)
//
// La chapa se fabrica ANTES de saber a qué animal irá: se imprime un lote, se
// mete en una caja y se reparte. Por eso su código NO puede derivarse del
// animal como hace `Animal.code` (que es NOMBRE-NNN y se genera al crear la
// ficha): aquí el código nace vacío y se casa con un animal más tarde.
//
// Esa separación es la que permite además REASIGNAR una chapa (animal
// fallecido, collar perdido, devolución) sin tirar el metal a la basura.
// ---------------------------------------------------------------------------

// Alfabeto Crockford base32: sin I, L, O ni U. Las tres primeras porque en una
// chapa rayada por el uso se confunden con 1 y 0; la U porque sin ella el azar
// no puede componer palabrotas en español.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SUFFIX_LENGTH = 6;

// 32^6 = 1.073.741.824 por prefijo. Con lotes de 100 unidades la probabilidad
// de colisión es despreciable, pero `generateTags` reintenta igualmente porque
// el índice único es la única garantía de verdad.
export function randomTagSuffix(length = SUFFIX_LENGTH) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

// El código de la chapa es opaco A PROPÓSITO. Nadie lo teclea a mano: se llega
// por QR, y lo que sí se teclea (el código del animal) es otro campo. Si fuera
// correlativo (MPL-0001…0100) cualquiera recorrería todos los pasaportes
// publicados escribiendo números.
export function normalizeTagCode(value?: unknown) {
  return String(value || '').trim().toUpperCase();
}

const tagSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, index: true },
    // Lote de fabricación: sirve para exportar el CSV que se manda al proveedor
    // y para saber de qué pedido salió una chapa que llega devuelta.
    batch: { type: String, required: true, index: true },
    // Vacío hasta que alguien la asigna. Es el estado de fábrica.
    animalId: { type: Schema.Types.ObjectId, ref: 'Animal', default: null, index: true },
    claimedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    claimedAt: { type: Date, default: null },
    // Anular una chapa (perdida, defectuosa, robada) sin borrarla: el código
    // grabado sigue existiendo en el mundo físico, así que debe seguir
    // existiendo aquí para poder responder "esta chapa ya no vale".
    revokedAt: { type: Date, default: null },
    scans: { type: Number, default: 0 },
    lastScanAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Tag = model('Tag', tagSchema);

export type TagStatus = 'libre' | 'vinculada' | 'anulada';

export function tagStatus(tag: any): TagStatus {
  if (!tag) return 'libre';
  if (tag.revokedAt) return 'anulada';
  return tag.animalId ? 'vinculada' : 'libre';
}

// Genera un lote y lo inserta. Devuelve las chapas creadas en el orden en que
// se imprimirán. `prefix` se decide en el momento del pedido (marca, campaña,
// mes) y va grabado; por eso es un parámetro y no una constante del código.
export async function generateTags(opts: { count: number; batch: string; prefix?: string }) {
  const { count, batch } = opts;
  const prefix = normalizeTagCode(opts.prefix || 'MPL');
  const created: any[] = [];

  for (let i = 0; i < count; i += 1) {
    let inserted = null;
    // Reintento por colisión del índice único. 8 intentos sobre mil millones de
    // combinaciones: si fallan los ocho, algo va mal de verdad y hay que parar
    // antes de generar un CSV incompleto para el proveedor.
    for (let attempt = 0; attempt < 8 && !inserted; attempt += 1) {
      const code = `${prefix}-${randomTagSuffix()}`;
      try {
        // eslint-disable-next-line no-await-in-loop
        inserted = await Tag.create({ code, batch });
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
      }
    }
    if (!inserted) throw new Error('tag_code_generation_failed');
    created.push(inserted);
  }

  return created;
}
