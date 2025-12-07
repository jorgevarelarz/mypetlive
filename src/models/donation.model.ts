import { Schema, model, Document } from 'mongoose';

export interface IDonation extends Document {
  userId?: string;
  animalId?: string;
  amount: number; // in cents
  currency: string; // e.g., 'eur'
  status: 'pending' | 'completed' | 'failed';
  sessionId?: string;
  paymentRef?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IDonation>(
  {
    userId: { type: String },
    animalId: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'eur' },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    sessionId: { type: String },
    paymentRef: { type: String },
  },
  { timestamps: true },
);

schema.index({ userId: 1, createdAt: -1 });

export const Donation = model<IDonation>('Donation', schema);

