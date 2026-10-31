import { Schema, model } from 'mongoose';

// Contrato de cesión gratuita entre particulares (Ley 7/2023, art. 58.2: «debe
// ir acompañada de un contrato de cesión en el que se declare esta condición»).
// Se guarda el texto exacto que se firmó y una foto de los datos de ese
// momento: si luego cambian el nombre o el correo, el contrato no cambia.
const signatureSchema = new Schema(
  {
    userId: { type: String, required: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    at: { type: Date, required: true },
    ip: String,
    userAgent: String,
  },
  { _id: false },
);

const cessionContractSchema = new Schema(
  {
    adoptionId: { type: String, required: true, unique: true },
    animalId: { type: String, required: true, index: true },
    fromUserId: { type: String, required: true, index: true },
    toUserId: { type: String, required: true, index: true },
    version: { type: Number, default: 1 },
    text: { type: String, required: true },
    animal: {
      name: String,
      species: String,
      sex: String,
      birthDate: Date,
      microchip: String,
    },
    signatures: { type: [signatureSchema], default: [] },
    completedAt: Date,
    // Cambio de titular del microchip (art. 24.2 i): lo marca quien cede.
    titleChangedAt: Date,
    cancelledAt: Date,
  },
  { timestamps: true },
);

export const CessionContract = model('CessionContract', cessionContractSchema);
