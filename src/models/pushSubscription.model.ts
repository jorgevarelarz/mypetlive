import { Schema, model } from 'mongoose';

// Suscripción Web Push de un dispositivo (PWA instalada en iPhone/Android o
// navegador de escritorio). Un usuario puede tener varias (un doc por dispositivo).
const schema = new Schema(
  {
    userId: { type: String, index: true, required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
  },
  { timestamps: true },
);

export const PushSubscription = model('PushSubscription', schema);
