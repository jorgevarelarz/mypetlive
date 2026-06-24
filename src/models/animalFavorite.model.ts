import { Schema, model } from 'mongoose';

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    animalId: { type: Schema.Types.ObjectId, ref: 'Animal', required: true, index: true },
  },
  { timestamps: true },
);

schema.index({ userId: 1, animalId: 1 }, { unique: true });

export const AnimalFavorite = model('AnimalFavorite', schema);
