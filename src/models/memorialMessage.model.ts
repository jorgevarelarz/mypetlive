import { Schema, model, Types } from 'mongoose';

// Mensajes que dejan las visitas en el mural de una mascota fallecida.
//
// Colección aparte y no un array del animal: los pendientes son texto anónimo
// sin revisar, y fuera del animal no hay forma de que una salida de la ficha
// (pasaporte, «mis mascotas», un toObject descuidado) los publique.
// Solo salen en el mural los que la familia publica; «privado» se queda para ella.

export type MemorialMessageStatus = 'pending' | 'published' | 'private';

const schema = new Schema(
  {
    animalId: { type: Schema.Types.ObjectId, ref: 'Animal', required: true, index: true },
    name: { type: String, trim: true, required: true, maxlength: 80 },
    text: { type: String, trim: true, required: true, maxlength: 600 },
    status: { type: String, enum: ['pending', 'published', 'private'], default: 'pending', index: true },
  },
  { timestamps: true },
);

schema.index({ animalId: 1, status: 1, createdAt: -1 });

export interface IMemorialMessage {
  _id: Types.ObjectId;
  animalId: Types.ObjectId;
  name: string;
  text: string;
  status: MemorialMessageStatus;
  createdAt: Date;
}

export const MemorialMessage = model('MemorialMessage', schema);
