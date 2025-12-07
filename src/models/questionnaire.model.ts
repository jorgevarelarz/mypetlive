import mongoose, { Schema, model, Document } from 'mongoose';

export interface IQuestionnaire extends Document {
  protectoraId: mongoose.Types.ObjectId;
  questions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const questionnaireSchema = new Schema<IQuestionnaire>(
  {
    protectoraId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    questions: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const Questionnaire = model<IQuestionnaire>('Questionnaire', questionnaireSchema);
