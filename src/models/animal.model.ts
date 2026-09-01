import { Schema, model, Document } from 'mongoose';
import { normalizeSpecies } from '../utils/species';
import { SUPPLY_UNITS } from '../utils/supplies';

const CODE_ATTEMPTS = 8;

function slugifyName(value?: string) {
  const base = String(value || 'PET')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 8)
    .toUpperCase();
  return base || 'PET';
}

function randomInt(min: number, max: number) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

async function assignCode(doc: any) {
  const base = slugifyName(doc.name);
  const Model = doc.constructor;
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const candidate = `${base}-${randomInt(100, 999)}`;
    const exists = await Model.exists({ code: candidate });
    if (!exists) {
      doc.code = candidate;
      return;
    }
  }
  throw new Error('animal_code_generation_failed');
}

async function ensureCode(doc: any) {
  if (doc.code) return doc.code;
  await assignCode(doc);
  await doc.save();
  return doc.code;
}

const vetEntrySchema = new Schema(
  {
    date: { type: Date, required: true },
    note: { type: String, required: true },
    treatment: { type: String },
  },
  { _id: false },
);

const healthEntrySchema = new Schema(
  {
    date: { type: Date, default: Date.now },
    type: { type: String, required: true },
    notes: { type: String },
    vetId: { type: Schema.Types.ObjectId, ref: 'User' },
    // Cuándo toca repetirlo. Es lo que convierte el pasaporte en algo que avisa
    // solo: sin esta fecha, apuntar una vacuna es escribir en un cuaderno que
    // nadie vuelve a abrir. Opcional — hay hitos que no se repiten (una cirugía).
    nextDueAt: { type: Date },
    // Sello del aviso ya enviado, para que la pasada del job sea idempotente.
    reminderSentAt: { type: Date },
  },
  { _id: false },
);

// Producto de la despensa. Las cantidades viven en la unidad base de su familia
// (g, ml, ud) para que "saco de 6 kg" y "ración de 80 g" puedan restarse; `unit`
// solo recuerda en qué unidad prefiere leerlo quien lo escribió.
const supplySchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 80, required: true },
    unit: { type: String, enum: SUPPLY_UNITS },
    packSize: { type: Number, min: 0 },
    perUse: { type: Number, min: 0 },
    remaining: { type: Number, min: 0 },
    // Cuándo se avisó de que se acababa. Existe para no repetir el aviso en cada
    // pasada del cron; se borra al reponer, que es lo que rearma la alerta.
    lowNotifiedAt: { type: Date },
    updatedAt: { type: Date },
  },
  { _id: false },
);

// Un avistamiento es lo que manda quien se encuentra al animal y escanea su QR.
// Las coordenadas son OPCIONALES y solo se guardan si el navegador las cede tras
// aceptarlo: son un dato personal de quien las envía, no del animal. Por eso
// nunca salen en el pasaporte público — solo las ve la familia (ver
// `listSightings` en el controlador).
const sightingSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    // Radio de precisión en metros que reporta el navegador. Sin esto, "está
    // aquí" con 3 km de error se lee como una certeza que no existe.
    accuracy: { type: Number, min: 0 },
    note: { type: String, trim: true, maxlength: 500 },
    // Cómo contactar con quien lo ha visto. Libre a propósito: puede ser un
    // teléfono, un correo o nada.
    contact: { type: String, trim: true, maxlength: 120 },
  },
  { _id: true },
);

// Estado de "se ha perdido". Vive en el animal y no en una colección aparte
// porque solo hay un episodio abierto a la vez y el pasaporte lo lee en la misma
// consulta que ya hace.
const lostSchema = new Schema(
  {
    isLost: { type: Boolean, default: false },
    since: { type: Date },
    // Zona aproximada donde se perdió, en texto libre ("Sada, cerca del puerto").
    area: { type: String, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 500 },
    // Los avistamientos NO se borran al aparecer el animal: son el historial de
    // lo que pasó y sirven si vuelve a perderse por la misma zona.
    sightings: { type: [sightingSchema], default: [] },
  },
  { _id: false },
);

const animalSchema = new Schema(
  {
    shelter: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    species: { type: String, required: true, set: normalizeSpecies },
    breed: { type: String },
    sex: { type: String, enum: ['male', 'female'], default: 'female' },
    age: { type: String, required: true },
    ageGroup: { type: String, enum: ['puppy', 'young', 'adult', 'senior'] },
    city: { type: String, trim: true, index: true },
    size: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
    goodWithChildren: { type: Boolean },
    goodWithDogs: { type: Boolean },
    goodWithCats: { type: Boolean },
    status: {
      type: String,
      enum: ['borrador', 'publicado', 'reservado', 'preadoptado', 'adoptado', 'no_disponible', 'archivado'],
      default: 'borrador',
      index: true,
    },
    personality: {
      type: [String],
      default: [],
      validate: [(val: string[]) => val.length <= 3, 'personality_limit'],
    },
    description: { type: String },
    story: { type: String },
    images: { type: [String], default: [] },
    vetHistory: { type: [vetEntrySchema], default: [] },
    healthHistory: { type: [healthEntrySchema], default: [] },
    likes: { type: [String], default: [] },
    environment: { type: [String], default: [] },
    mood: { type: String, enum: ['relajado', 'timido', 'energico', 'en_adaptacion', null], default: null },
    // Caché del último cuidado de cada tipo: la verdad está en `CareLog`, pero la
    // ficha y la home solo necesitan "cuándo fue la última vez" y no van a pagar
    // una consulta al registro para pintar una frase.
    lastFeeding: { type: Date },
    lastLitterChange: { type: Date },
    lastWalk: { type: Date },
    // "Despensa": lo que de verdad usa esta mascota, aprendido de lo que se marca.
    // Evita reescribir la marca del pienso tres veces al día y evita mantener un
    // catálogo global de productos que nadie actualizaría.
    //
    // Con `packSize` y `perUse` deja de ser una lista de nombres y pasa a
    // responder "¿para cuántas comidas queda?": cada marca descuenta una ración
    // de `remaining`. Todo salvo el nombre es opcional — quien no quiera llevar
    // la cuenta sigue teniendo los mismos chips de siempre.
    carePantry: {
      type: new Schema(
        {
          foods: { type: [supplySchema], default: [] },
          litters: { type: [supplySchema], default: [] },
        },
        { _id: false },
      ),
      default: () => ({ foods: [], litters: [] }),
    },
    code: { type: String, unique: true, uppercase: true, index: true },
    lost: {
      type: lostSchema,
      default: () => ({ isLost: false, sightings: [] }),
    },
    isPersonalPet: { type: Boolean, default: false, index: true },
    createdByRole: { type: String, enum: ['protectora', 'tenant'], required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  },
  { timestamps: true },
);

// Buscar "animales perdidos cerca de mí" es una consulta por zona, no por animal.
animalSchema.index({ 'lost.isLost': 1, city: 1 });

animalSchema.pre('save', async function handleCode(next) {
  try {
    if (!this.code) {
      await assignCode(this);
    }
    next();
  } catch (err) {
    next(err as Error);
  }
});

export const Animal = model('Animal', animalSchema);

export async function ensureAnimalCodes(batchSize = 100) {
  while (true) {
    const animals = await Animal.find({ $or: [{ code: { $exists: false } }, { code: null }, { code: '' }] })
      .limit(batchSize);
    if (!animals.length) break;
    // eslint-disable-next-line no-await-in-loop
    for (const animal of animals) {
      // eslint-disable-next-line no-await-in-loop
      await ensureCode(animal);
    }
    if (animals.length < batchSize) break;
  }
}

export async function ensureAnimalCode(animal: Document & { code?: string; name?: string }) {
  if (!animal) return undefined;
  return ensureCode(animal);
}
