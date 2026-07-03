import { Schema, model } from 'mongoose';

/**
 * Ledger único del sistema de Patitas (moneda de impacto). Cada movimiento queda
 * auditado: de dónde vienen las Patitas y a dónde van.
 *
 *  - earn:   un usuario genera Patitas (cupón / visita a tienda).   userId = dueño.
 *  - donate: un usuario dona Patitas a una protectora.              userId = donante, shelterId = receptor.
 *  - redeem: una protectora canjea Patitas en un partner (tienda/vet).
 *            shelterId = gastador, partnerId = partner, valueEur = € a pagar, code = confirmación.
 */
const patitaTxnSchema = new Schema(
  {
    type: { type: String, enum: ['earn', 'donate', 'redeem'], required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    shelterId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    partnerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    amount: { type: Number, required: true }, // Patitas (positivo)
    valueEur: { type: Number }, // solo redeem: amount * PATITA_VALUE_EUR
    source: { type: String, enum: ['coupon', 'visit', 'manual', 'purchase'] }, // solo earn
    couponId: { type: Schema.Types.ObjectId, ref: 'Coupon' },
    animalId: { type: Schema.Types.ObjectId, ref: 'Animal' },
    concept: { type: String },
    code: { type: String }, // solo redeem: confirmación única
    status: {
      type: String,
      enum: ['completed', 'pending_payout', 'paid', 'failed'],
      default: 'completed',
      index: true,
    },
    payoutRef: { type: String }, // id del Stripe transfer al partner
  },
  { timestamps: true, versionKey: false },
);

// Código de canje único (sparse: solo aplica a redeem).
patitaTxnSchema.index({ code: 1 }, { unique: true, sparse: true });
patitaTxnSchema.index({ shelterId: 1, type: 1, createdAt: -1 });
patitaTxnSchema.index({ userId: 1, type: 1, createdAt: -1 });

export const PatitaTxn = model('PatitaTxn', patitaTxnSchema);
