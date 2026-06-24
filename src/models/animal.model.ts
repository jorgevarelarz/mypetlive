import { Schema, model, Document } from 'mongoose';

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
  },
  { _id: false },
);

const animalSchema = new Schema(
  {
    shelter: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    species: { type: String, required: true },
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
    lastFeeding: { type: Date },
    lastLitterChange: { type: Date },
    code: { type: String, unique: true, uppercase: true, index: true },
    isPersonalPet: { type: Boolean, default: false, index: true },
    createdByRole: { type: String, enum: ['protectora', 'tenant'], required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  },
  { timestamps: true },
);

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
