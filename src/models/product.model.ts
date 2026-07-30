import { Schema, model, Document, Types } from 'mongoose';

// Producto del marketplace.
//
// `listedBy` decide quién vende y, con ello, quién factura y quién responde de
// la garantía (ver `utils/marketplace.ts`). Un producto de tienda SIEMPRE tiene
// `sellerId`; uno nuestro nunca lo tiene y sí lleva `costEur`, que es lo que le
// pagamos al proveedor y lo que hace que el sobrecoste sea auditable.

export const PRODUCT_CATEGORIES = [
  'comida',
  'arena',
  'snacks',
  'higiene',
  'juguetes',
  'accesorios',
  'salud',
  'otros',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export interface IProduct extends Document {
  listedBy: 'partner' | 'platform';
  sellerId?: Types.ObjectId;
  name: string;
  description?: string;
  images: string[];
  category: ProductCategory;
  /** Especies a las que aplica; vacío = todas. */
  species: string[];
  priceEur: number;
  /** Solo 'platform': lo que nos cuesta. Nunca se expone en la API pública. */
  costEur?: number;
  stock: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IProduct>(
  {
    listedBy: { type: String, enum: ['partner', 'platform'], required: true, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000 },
    images: { type: [String], default: [] },
    category: { type: String, enum: PRODUCT_CATEGORIES, default: 'otros', index: true },
    species: { type: [String], default: [] },
    priceEur: { type: Number, required: true, min: 0.5, max: 1000 },
    costEur: { type: Number, min: 0, max: 1000 },
    // Sin stock no se puede vender: en un marketplace de envío, prometer lo que
    // no hay es la forma más rápida de acumular reembolsos.
    stock: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// El listado público siempre pregunta lo mismo: activo, con stock, por categoría.
schema.index({ active: 1, stock: 1, category: 1 });
schema.index({ name: 'text', description: 'text' });

export const Product = model<IProduct>('Product', schema);
