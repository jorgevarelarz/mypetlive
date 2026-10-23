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
    // Cómo avisar a la familia, y **solo mientras el animal esté perdido**.
    //
    // Vive en el episodio y no en el perfil a propósito: es un dato que se
    // publica en una página que puede ver cualquiera con la chapa en la mano,
    // así que se pide y se consiente en el momento de marcar la pérdida, se
    // elige qué se enseña (un móvil que no es el de casa, por ejemplo) y
    // desaparece solo al marcar "ha aparecido". Un teléfono en el perfil no
    // tiene nada de eso.
    contact: { type: String, trim: true, maxlength: 120 },
    // Los avistamientos NO se borran al aparecer el animal: son el historial de
    // lo que pasó y sirven si vuelve a perderse por la misma zona.
    sightings: { type: [sightingSchema], default: [] },
  },
  { _id: false },
);

// Recordatorios de comida, arena y paseos. Por mascota: cada una tiene su
// rutina. Con `times` vacío el aviso es «por olvido» (lleva demasiado sin
// marcarse); con horas, avisa a esas horas. `off` lo apaga.
// Las horas son «HH:MM» de hora española: es la que tiene en la cabeza la
// familia, y el servidor corre en UTC.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const careTimesSchema = new Schema(
  {
    off: { type: Boolean, default: false },
    times: {
      type: [{ type: String, match: HHMM }],
      default: [],
      validate: [(val: string[]) => val.length <= 4, 'too_many_times'],
    },
  },
  { _id: false },
);
const careRemindersSchema = new Schema(
  {
    feed: { type: careTimesSchema, default: () => ({}) },
    walk: { type: careTimesSchema, default: () => ({}) },
    litter: {
      type: new Schema(
        {
          off: { type: Boolean, default: false },
          // Cada cuántos días toca y a qué hora avisar. Sin `everyDays`: por olvido.
          everyDays: { type: Number, min: 1, max: 14 },
          time: { type: String, match: HHMM },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    // Estado del trabajo, no de la familia: qué hueco ya se avisó (idempotencia
    // entre pasadas) y cuándo se avisó por olvido (uno por despiste, no uno
    // cada cinco minutos).
    sent: {
      type: new Schema(
        {
          feedSlot: String, walkSlot: String, litterSlot: String,
          feedLate: Date, walkLate: Date, litterLate: Date,
        },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  { _id: false },
);

// «En su memoria». Cuando una mascota fallece la familia la despide y su ficha
// pasa a ser un mural: el QR de la chapa lo enseña y se paran todos los avisos.
// Se puede deshacer (`active: false`) sin perder lo escrito.
// Los mensajes de las visitas NO viven aquí sino en `MemorialMessage`: los que
// aún no ha aprobado la familia no pueden colarse en ninguna salida del animal.
const MEDIA_URL = /\/uploads\/[\w-]+\.(webp|jpg|png|gif|mp4|mov)$/i;
const memorialSchema = new Schema(
  {
    active: { type: Boolean, default: false },
    since: { type: Date },
    diedAt: { type: Date },
    epitaph: { type: String, trim: true, maxlength: 300 },
    epitaphBy: { type: String, trim: true, maxlength: 120 },
    favorites: {
      type: new Schema(
        {
          food: { type: String, trim: true, maxlength: 160 },
          toy: { type: String, trim: true, maxlength: 160 },
          place: { type: String, trim: true, maxlength: 160 },
          nap: { type: String, trim: true, maxlength: 160 },
          nicknames: { type: String, trim: true, maxlength: 160 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    // Fotos y vídeos del mural. Al despedirla entran las de su ficha.
    media: {
      type: [
        new Schema(
          {
            url: { type: String, required: true, match: MEDIA_URL },
            kind: { type: String, enum: ['image', 'video'], default: 'image' },
          },
          { _id: false },
        ),
      ],
      default: [],
      validate: [(val: unknown[]) => val.length <= 120, 'too_many_media'],
    },
    memories: {
      type: [
        new Schema(
          {
            // «2014-03»: un recuerdo se fecha por mes, casi nunca por día.
            month: { type: String, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
            text: { type: String, trim: true, required: true, maxlength: 1000 },
            photo: { type: String, match: MEDIA_URL },
          },
          { _id: true, timestamps: { createdAt: true, updatedAt: false } },
        ),
      ],
      default: [],
      validate: [(val: unknown[]) => val.length <= 100, 'too_many_memories'],
    },
    candles: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const animalSchema = new Schema(
  {
    shelter: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    species: { type: String, required: true, set: normalizeSpecies },
    breed: { type: String },
    // Sin `default`. Lo tenían ('female' y 'medium') y era una mentira silenciosa:
    // el alta de una mascota de la familia no pedía ninguno de los dos, así que
    // TODAS entraban como hembra de tamaño mediano y eso es lo que enseñaba el
    // pasaporte público del QR del collar. Preferimos el hueco vacío a un dato
    // inventado: quien lee la ficha ya trata la ausencia (`sex ? … : null` en el
    // pasaporte, en la ficha y en el SEO). El alta de protectora no se entera:
    // `animalCreateSchema` exige los dos campos.
    sex: { type: String, enum: ['male', 'female', null] },
    age: { type: String, required: true },
    // Mascotas de usuarios: con ella `age` se recalcula (utils/age).
    birthDate: { type: Date },
    ageGroup: { type: String, enum: ['puppy', 'young', 'adult', 'senior'] },
    city: { type: String, trim: true, index: true },
    size: { type: String, enum: ['small', 'medium', 'large', null] },
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
    mood: { type: String, enum: ['relajado', 'timido', 'energico', 'en_adaptacion', 'carinoso', 'independiente', null], default: null },
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
    careReminders: { type: careRemindersSchema, default: () => ({}) },
    memorial: { type: memorialSchema, default: undefined },
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
