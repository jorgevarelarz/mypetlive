import { Schema, model } from 'mongoose';

// Registro persistente de cada identificación de cliente por un partner.
// Base del informe de fugas de comisión: una identificación que no acaba
// enlazada a una venta (saleId) es una venta probablemente no declarada.
const partnerIdentificationSchema = new Schema(
  {
    partnerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale' },
  },
  { timestamps: true },
);

partnerIdentificationSchema.index({ partnerId: 1, createdAt: -1 });
partnerIdentificationSchema.index({ partnerId: 1, userId: 1, saleId: 1, createdAt: -1 });

export const PartnerIdentification = model('PartnerIdentification', partnerIdentificationSchema);
