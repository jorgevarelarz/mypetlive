import { Schema, model, Document } from 'mongoose';

/**
 * Catálogo de comida y arena para el autocompletado de «Marcar comida», la
 * arena y la despensa. No es la tienda: es la lista de lo que la gente da de
 * comer de verdad. Arranca con Open Pet Food Facts (productos vendidos en
 * España) y una lista de marcas hecha a mano, y crece sola: cada producto que
 * alguien apunta se guarda aquí (source 'user') y `uses` ordena las sugerencias.
 */
export interface IPetProduct extends Document {
  kind: 'food' | 'litter';
  name: string;
  /** Nombre normalizado (minúsculas, sin tildes ni espacios dobles) para buscar y no duplicar. */
  key: string;
  brand?: string;
  /** Especies para las que es (vacío = cualquiera). Canónicas: cat, dog, rabbit… */
  species: string[];
  barcode?: string;
  source: 'opff' | 'seed' | 'user' | 'store';
  uses: number;
  // De Open Pet Food Facts, para una futura valoración de la comida a partir
  // de datos objetivos de la etiqueta (ingredientes y analítica).
  imageUrl?: string;
  ingredients?: string;
  nutrition?: { protein?: number; fat?: number; fiber?: number };
}

const schema = new Schema<IPetProduct>(
  {
    kind: { type: String, enum: ['food', 'litter'], required: true },
    name: { type: String, required: true, trim: true, maxlength: 140 },
    key: { type: String, required: true },
    brand: { type: String, trim: true, maxlength: 80 },
    species: { type: [String], default: [] },
    barcode: { type: String, trim: true },
    source: { type: String, enum: ['opff', 'seed', 'user', 'store'], required: true },
    uses: { type: Number, default: 0 },
    imageUrl: { type: String },
    ingredients: { type: String, maxlength: 4000 },
    nutrition: { protein: Number, fat: Number, fiber: Number },
  },
  { timestamps: true },
);

schema.index({ kind: 1, key: 1 }, { unique: true });
schema.index({ kind: 1, uses: -1 });
schema.index({ barcode: 1 }, { unique: true, sparse: true });

export const PetProduct = model<IPetProduct>('PetProduct', schema);
