import { Schema, model, Document, Types } from 'mongoose';

// Pedido del marketplace.
//
// Un pedido = un vendedor. No es una limitación técnica: con envío, dos tiendas
// son dos paquetes, dos portes y dos responsables, y meterlos en un mismo pedido
// solo sirve para que nadie sepa a quién reclamar.
//
// Todo lo que puede cambiar mañana viaja congelado aquí: nombre y precio de cada
// línea, el % de comisión y el `listedBy`. Un pedido tiene que poder explicarse
// dentro de dos años aunque el producto ya no exista.

export type OrderStatus = 'pending_payment' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

export interface IOrder extends Document {
  reference: string;
  listedBy: 'partner' | 'platform';
  sellerId?: Types.ObjectId;
  buyer: { userId?: Types.ObjectId; email: string; name: string; phone?: string };
  /** Solo para invitados: sin cuenta, es lo único que da acceso al pedido. */
  guestToken?: string;
  items: Array<{ productId: Types.ObjectId; name: string; priceEur: number; qty: number; costEur?: number }>;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    postalCode: string;
    province?: string;
    country: string;
  };
  subtotalEur: number;
  shippingEur: number;
  totalEur: number;
  commissionPct: number;
  commissionEur: number;
  platformMarginEur: number;
  status: OrderStatus;
  sessionId?: string;
  paymentRef?: string;
  tracking?: { carrier?: string; code?: string; shippedAt?: Date };
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const itemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    priceEur: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1, max: 20 },
    costEur: { type: Number, min: 0 },
  },
  { _id: false },
);

const addressSchema = new Schema(
  {
    line1: { type: String, required: true, trim: true, maxlength: 160 },
    line2: { type: String, trim: true, maxlength: 160 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    postalCode: { type: String, required: true, trim: true, maxlength: 12 },
    province: { type: String, trim: true, maxlength: 80 },
    country: { type: String, default: 'ES', trim: true, maxlength: 2 },
  },
  { _id: false },
);

const schema = new Schema<IOrder>(
  {
    reference: { type: String, required: true, unique: true, index: true },
    listedBy: { type: String, enum: ['partner', 'platform'], required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    buyer: {
      userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
      email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
      name: { type: String, required: true, trim: true, maxlength: 120 },
      phone: { type: String, trim: true, maxlength: 30 },
    },
    guestToken: { type: String, index: true, select: false },
    items: { type: [itemSchema], required: true },
    shippingAddress: { type: addressSchema, required: true },
    subtotalEur: { type: Number, required: true, min: 0 },
    shippingEur: { type: Number, required: true, min: 0 },
    totalEur: { type: Number, required: true, min: 0 },
    commissionPct: { type: Number, default: 0, min: 0, max: 100 },
    commissionEur: { type: Number, default: 0, min: 0 },
    platformMarginEur: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['pending_payment', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending_payment',
      index: true,
    },
    sessionId: { type: String, index: true },
    paymentRef: { type: String },
    tracking: {
      type: new Schema(
        {
          carrier: { type: String, trim: true, maxlength: 60 },
          code: { type: String, trim: true, maxlength: 80 },
          shippedAt: { type: Date },
        },
        { _id: false },
      ),
    },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

export const Order = model<IOrder>('Order', schema);

/**
 * Referencia legible del pedido (MP-260729-4821).
 *
 * Existe porque el `_id` de Mongo no se puede dictar por teléfono, y un pedido
 * con envío se acaba hablando por teléfono.
 */
export function buildOrderReference(now = new Date()): string {
  const stamp = now.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `MP-${stamp}-${rand}`;
}
