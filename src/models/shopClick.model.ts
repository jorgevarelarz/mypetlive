import { Schema, model, Document, Types } from 'mongoose';

// Clics en "dónde comprarlo".
//
// Existe para responder una sola pregunta antes de construir el marketplace:
// cuando avisamos de que se acaba el pienso, ¿alguien va a la tienda? Si esto se
// queda vacío, no hay que montar ni carrito ni pagos ni logística.

export interface IShopClick extends Document {
  userId?: Types.ObjectId;
  /** Ausente en un producto que vendemos nosotros: no hay tienda detrás. */
  partnerId?: Types.ObjectId;
  /** Presente cuando el clic va a un producto comprable del marketplace. */
  productId?: Types.ObjectId;
  animalId?: Types.ObjectId;
  product: string;
  /** De dónde venía el clic: el aviso por correo, la ficha, el push. */
  source: string;
  createdAt: Date;
}

const schema = new Schema<IShopClick>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    // Dejó de ser obligatorio al entrar el marketplace: un producto nuestro no
    // tiene partner. Lo que un clic siempre tiene es destino, y ese destino es
    // `partnerId` o `productId` — nunca ninguno de los dos.
    partnerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', index: true },
    animalId: { type: Schema.Types.ObjectId, ref: 'Animal' },
    product: { type: String, trim: true, maxlength: 120 },
    source: { type: String, trim: true, maxlength: 40, default: 'unknown', index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const ShopClick = model<IShopClick>('ShopClick', schema);
