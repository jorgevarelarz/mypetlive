import { Schema, model } from 'mongoose';

const filtersSchema = new Schema(
  {
    q: String,
    species: String,
    size: { type: String, enum: ['small', 'medium', 'large'] },
    sex: { type: String, enum: ['male', 'female'] },
    city: String,
    ageGroup: { type: String, enum: ['puppy', 'young', 'adult', 'senior'] },
    goodWithChildren: Boolean,
    goodWithDogs: Boolean,
    goodWithCats: Boolean,
  },
  { _id: false },
);

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    filters: { type: filtersSchema, default: () => ({}) },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

schema.index({ userId: 1, createdAt: -1 });

export const AnimalAlert = model('AnimalAlert', schema);
