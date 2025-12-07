import { Schema, model, Document } from 'mongoose';

export type AdoptionStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface IAdoptionHistoryItem {
  ts: Date;
  actorId?: string;
  action: string;
  payload?: Record<string, unknown>;
}

export interface IAdoption extends Document {
  animalId: string;
  adopterId: string;
  status: AdoptionStatus;
  answers: { question: string; answer: string }[];
  history: IAdoptionHistoryItem[];
  createdAt: Date;
  updatedAt: Date;
}

const answerSchema = new Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { _id: false },
);

const schema = new Schema<IAdoption>(
  {
    animalId: { type: String, required: true },
    adopterId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'cancelled'], default: 'pending' },
    answers: { type: [answerSchema], default: [] },
  },
  { timestamps: true },
);

schema.add({
  history: {
    type: [
      {
        ts: { type: Date, default: Date.now },
        actorId: { type: String },
        action: { type: String, required: true },
        payload: { type: Schema.Types.Mixed },
      },
    ],
    default: [],
  },
});

schema.index({ animalId: 1, adopterId: 1 }, { unique: true });

export const Adoption = model<IAdoption>('Adoption', schema);
