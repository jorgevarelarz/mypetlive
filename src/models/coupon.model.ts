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
    // Targeting de perfil para ofertas personalizadas (motor de ofertas).
    targetSpecies: { type: [String], default: [] },
    targetAgeGroup: { type: [String], default: [] }, // puppy|young|adult|senior
    targetSize: { type: [String], default: [] }, // small|medium|large
    targetCity: { type: String, trim: true },
    sponsored: { type: Boolean, default: false, index: true }, // placement de pago (destacado)
    // Estado del placement patrocinado pagado por el partner. 'active' lo activa
    // el webhook de Stripe; 'none' permite también activación manual por admin (RSC).
    sponsorshipStatus: { type: String, enum: ['none', 'pending', 'active'], default: 'none', index: true },
    sponsorPaymentRef: { type: String },
    expiresAt: { type: Date },
    usedAt: { type: Date, index: true },
    usedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

couponSchema.index({ partnerType: 1, active: 1, usedAt: 1, targetAnimalCode: 1 });

export const Coupon = model('Coupon', couponSchema);
