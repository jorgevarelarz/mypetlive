import { Schema, model } from 'mongoose';

// Token de notificaciones de la app nativa (APNs en iPhone). Un documento por
// móvil; el mismo móvil con otra cuenta reasigna el token (upsert por `token`).
const schema = new Schema(
  {
    userId: { type: String, index: true, required: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['ios'], required: true },
  },
  { timestamps: true },
);

export const NativePushToken = model('NativePushToken', schema);
