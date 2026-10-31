import { Schema, model, Document } from 'mongoose';

export interface IDonation extends Document {
  userId?: string;
  animalId?: string;
  amount: number; // in cents
  currency: string; // e.g., 'eur'
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'disputed';
  sessionId?: string;
  paymentRef?: string;
  shelterId?: string; // protectora que cobra la donación
  patitasGranted?: number; // Patitas concedidas de verdad al completarse
  patitasShelterId?: string; // protectora que recibió esas Patitas
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IDonation>(
  {
    userId: { type: String },
    animalId: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'eur' },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded', 'disputed'], default: 'pending' },
    sessionId: { type: String },
    paymentRef: { type: String },
    shelterId: { type: String },
    patitasGranted: { type: Number },
    patitasShelterId: { type: String },
  },
  { timestamps: true },
);

schema.index({ userId: 1, createdAt: -1 });
// Para encontrar la donación cuando Stripe avisa de un reembolso o una disputa.
schema.index({ paymentRef: 1 });

export const Donation = model<IDonation>('Donation', schema);
