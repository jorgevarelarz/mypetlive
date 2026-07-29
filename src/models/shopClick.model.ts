import { Schema, model, Document, Types } from 'mongoose';

// Clics en "dónde comprarlo".
//
// Existe para responder una sola pregunta antes de construir el marketplace:
// cuando avisamos de que se acaba el pienso, ¿alguien va a la tienda? Si esto se
// queda vacío, no hay que montar ni carrito ni pagos ni logística.

export interface IShopClick extends Document {
  userId?: Types.ObjectId;
  partnerId: Types.ObjectId;
  animalId?: Types.ObjectId;
  product: string;
  /** De dónde venía el clic: el aviso por correo, la ficha, el push. */
  source: string;
  createdAt: Date;
}

const schema = new Schema<IShopClick>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    partnerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    animalId: { type: Schema.Types.ObjectId, ref: 'Animal' },
    product: { type: String, trim: true, maxlength: 120 },
    source: { type: String, trim: true, maxlength: 40, default: 'unknown', index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const ShopClick = model<IShopClick>('ShopClick', schema);
