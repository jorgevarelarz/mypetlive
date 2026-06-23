import { Schema, model } from 'mongoose';

const couponSchema = new Schema(
  {
    partnerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    partnerType: { type: String, enum: ['store', 'vet'], required: true },
    copy: { type: String, required: true },
    title: { type: String },
    description: { type: String },
    discount: { type: String, required: true },
    bonusPatitas: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true },
    targetAnimalCode: { type: String, uppercase: true, trim: true },
    expiresAt: { type: Date },
    usedAt: { type: Date, index: true },
    usedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

couponSchema.index({ partnerType: 1, active: 1, usedAt: 1, targetAnimalCode: 1 });

export const Coupon = model('Coupon', couponSchema);
