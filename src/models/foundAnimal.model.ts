import { Schema, model } from 'mongoose';

// Animal ENCONTRADO por un particular autorizado (User.rehome). La Ley 7/2023
// no le deja cederlo (no está a su nombre, arts. 27 m y 58.1), así que el
// camino es: buscar a su familia (chip, ayuntamiento, ficha pública de
// «encontrado») y, si nadie aparece, pedir a una protectora que lo acoja; el
// particular queda como casa de acogida (art. 3 l) y la protectora lo da en
// adopción. Aquí vive todo lo anterior a que la protectora tenga su ficha.
//
// Estados: buscando (ficha pública, pasos en marcha) → acogida_pedida →
// en_acogida (la protectora aceptó y el particular firmó el acuerdo; existe
// `animalId`). Salidas: reunido (apareció su familia o tenía chip) o retirado.
const signatureSchema = new Schema(
  { userId: String, fullName: String, at: Date, ip: String, userAgent: String },
  { _id: false },
);

const foundAnimalSchema = new Schema(
  {
    finderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, trim: true, maxlength: 60 },
    species: { type: String, required: true },
    sex: { type: String, enum: ['male', 'female', null], default: null },
    approxAge: { type: String, trim: true, maxlength: 40 },
    images: { type: [String], default: [] },
    foundAt: { type: Date, required: true },
    foundPlace: { type: String, trim: true, maxlength: 160, required: true },
    city: { type: String, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ['buscando', 'acogida_pedida', 'en_acogida', 'reunido', 'retirado'],
      default: 'buscando',
      index: true,
    },
    publishedAt: { type: Date, default: Date.now },
    // Paso 1: chip leído en un veterinario.
    chip: {
      type: new Schema({ result: { type: String, enum: ['none', 'has_chip'] }, vetName: String, at: Date }, { _id: false }),
    },
    // Paso 2: aviso al ayuntamiento o a la Policía Local.
    council: {
      type: new Schema({ who: String, at: Date }, { _id: false }),
    },
    // Paso 4: acogida con una protectora.
    foster: {
      type: new Schema(
        {
          shelterId: String,
          // Lo normal es que la protectora no pueda llevárselo: el animal se
          // queda en casa de quien lo encontró y la protectora solo formaliza
          // (chip a su nombre, art. 51.1, y adopción). find_home: la protectora
          // le busca familia; keep: se lo da en adopción a quien lo encontró.
          intent: { type: String, enum: ['find_home', 'keep'], default: 'find_home' },
          message: String,
          requestedAt: Date,
          acceptedAt: Date,
          rejectedAt: Date,
          agreementText: String,
          signatures: { type: [signatureSchema], default: [] },
        },
        { _id: false },
      ),
    },
    animalId: { type: String },
    closedAt: Date,
  },
  { timestamps: true },
);

export const FoundAnimal = model('FoundAnimal', foundAnimalSchema);

// Quien cree que el animal encontrado es suyo: una por persona y animal, para
// tener su propia conversación con quien lo encontró.
const foundClaimSchema = new Schema(
  {
    foundId: { type: String, required: true, index: true },
    claimantId: { type: String, required: true },
    finderId: { type: String, required: true },
  },
  { timestamps: true },
);
foundClaimSchema.index({ foundId: 1, claimantId: 1 }, { unique: true });

export const FoundClaim = model('FoundClaim', foundClaimSchema);
