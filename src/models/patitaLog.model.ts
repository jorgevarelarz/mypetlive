import { Schema, model } from 'mongoose';

const patitaLogSchema = new Schema(
  {
    shelterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    partnerId: { type: Schema.Types.ObjectId, ref: 'User' },
    animalId: { type: Schema.Types.ObjectId, ref: 'Animal' },
    amount: { type: Number, default: 1 },
    source: {
      type: String,
      enum: ['manual', 'click', 'donation', 'coupon', 'store', 'vet', 'coupon_bonus', 'purchase'],
      default: 'click',
    },
    concept: { type: String },
    proofImageUrl: { type: String },
    partnerNotes: { type: String },
    treatmentType: { type: String },
    confirmedAt: { type: Date },
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    couponId: { type: Schema.Types.ObjectId, ref: 'Coupon' },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

export const PatitaLog = model('PatitaLog', patitaLogSchema);
