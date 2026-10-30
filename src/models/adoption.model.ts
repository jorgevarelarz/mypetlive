import { Schema, model, Document } from 'mongoose';

export type AdoptionStatus =
  | 'recibida'
  | 'cuestionario_pendiente'
  | 'en_revision'
  | 'info_adicional'
  | 'cita_propuesta'
  | 'preaprobada'
  | 'aprobada'
  | 'rechazada'
  | 'cancelada';

export interface IAdoptionHistoryItem {
  ts: Date;
  actorId?: string;
  action: string;
  payload?: Record<string, unknown>;
}

// Visita para conocer al animal que propone la protectora. Una sola a la vez:
// proponer otra fecha la sustituye (el chat guarda el rastro de las anteriores).
export interface IAdoptionVisit {
  at: Date;
  place?: string;
  note?: string;
  status: 'propuesta' | 'aceptada';
  proposedBy?: string;
  respondedAt?: Date;
}

export interface IAdoption extends Document {
  animalId: string;
  adopterId: string;
  status: AdoptionStatus;
  visit?: IAdoptionVisit;
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
    status: {
      type: String,
      enum: [
        'recibida',
        'cuestionario_pendiente',
        'en_revision',
        'info_adicional',
        'cita_propuesta',
        'preaprobada',
        'aprobada',
        'rechazada',
        'cancelada',
      ],
      default: 'recibida',
    },
    answers: { type: [answerSchema], default: [] },
    visit: {
      type: new Schema(
        {
          at: { type: Date, required: true },
          place: { type: String, trim: true, maxlength: 200 },
          note: { type: String, trim: true, maxlength: 500 },
          status: { type: String, enum: ['propuesta', 'aceptada'], default: 'propuesta' },
          proposedBy: { type: String },
          respondedAt: { type: Date },
        },
        { _id: false },
      ),
    },
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
