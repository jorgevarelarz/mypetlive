import { Schema, model } from 'mongoose';

// Venta registrada por un partner (tienda/vet) al pasar el código de un usuario.
// Fuente de verdad de la comisión de plataforma y del historial de compra del
// usuario: los items del ticket alimentan las ofertas personalizadas.
const saleItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    qty: { type: Number, default: 1, min: 0 },
    priceEur: { type: Number, min: 0 },
  },
  { _id: false },
);

const saleSchema = new Schema(
  {
    partnerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    partnerType: { type: String, enum: ['store', 'vet'], required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountEur: { type: Number, required: true, min: 0 },
    // Líneas del ticket (opcionales): las teclea el partner al registrar.
    items: { type: [saleItemSchema], default: [] },
    // Snapshot de la comisión en el momento de la venta (el % puede cambiar después).
    commissionPct: { type: Number, required: true, min: 0, max: 100 },
    commissionEur: { type: Number, required: true, min: 0 },
    patitasEarned: { type: Number, default: 0, min: 0 },
    // Liquidación del extracto: pending → invoiced → paid.
    settlementStatus: { type: String, enum: ['pending', 'invoiced', 'paid'], default: 'pending', index: true },
    invoiceRef: { type: String },
    // Clave de idempotencia del TPV (id del ticket en la caja): los reintentos de
    // red no duplican la venta. Única por partner solo cuando está presente.
    externalRef: { type: String, trim: true, maxlength: 120 },
    // Cupones consumidos en esta venta (auditoría + respuesta idéntica en los
    // reintentos idempotentes: el TPV puede reimprimir el ticket real).
    appliedCoupons: {
      type: [
        new Schema(
          {
            couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
            title: { type: String },
            discount: { type: String },
            bonusPatitas: { type: Number, default: 0 },
            targetAnimalCode: { type: String },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    // Patitas extra por cupones (separado de patitasEarned, lo proporcional al importe).
    couponPatitas: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

saleSchema.index({ partnerId: 1, createdAt: -1 });
saleSchema.index({ userId: 1, createdAt: -1 });
saleSchema.index(
  { partnerId: 1, externalRef: 1 },
  { unique: true, partialFilterExpression: { externalRef: { $type: 'string' } } },
);

export const Sale = model('Sale', saleSchema);
