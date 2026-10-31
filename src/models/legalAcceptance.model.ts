import { Schema, model } from 'mongoose';

/**
 * Rastro append-only de cada aceptación legal. El usuario guarda solo la
 * ÚLTIMA versión aceptada, pero para poder demostrar el consentimiento hay que
 * conservar cada aceptación con su fecha, versión, IP y user-agent: si mañana
 * el usuario acepta unos términos nuevos, la aceptación anterior no puede
 * desaparecer. Nunca se actualiza ni se borra un documento de esta colección.
 */
const legalAcceptanceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    slug: { type: String, enum: ['terms', 'privacy', 'tenant-pro-consent'], required: true },
    version: { type: String, required: true },
    acceptedAt: { type: Date, required: true, default: Date.now },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
);

legalAcceptanceSchema.index({ userId: 1, slug: 1, acceptedAt: -1 });

export const LegalAcceptance = model('LegalAcceptance', legalAcceptanceSchema);
