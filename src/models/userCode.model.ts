import { Schema, model } from 'mongoose';

// Código corto de identidad que el cliente muestra en caja (fallback manual del QR).
// Vive en Mongo (no en memoria) para sobrevivir reinicios/deploys y funcionar con
// varias instancias de la API; el índice TTL lo purga solo al caducar.
const userCodeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL: Mongo borra el documento al pasar expiresAt (con ~1 min de granularidad,
// por eso la lectura sigue comprobando expiresAt > now).
userCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserCode = model('UserCode', userCodeSchema);
