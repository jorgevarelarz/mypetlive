import { Schema, model, Document } from 'mongoose';

// Conversación de dos personas sobre algo concreto: una solicitud de adopción
// (adoptante ↔ protectora) o una cita veterinaria (dueño ↔ veterinario). Una
// por cosa: `kind` + `refId` es único.
export const CONVERSATION_KINDS = ['adoption', 'vet_appointment'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export interface IConversation extends Document {
  kind: ConversationKind;
  refId: string;
  participants: string[]; // exactly 2
  lastMessageAt?: Date;
  unread: Record<string, number>;
  // Correo de «tienes un mensaje sin leer»: una entrada por destinatario desde
  // su primer mensaje sin leer. Se borra al leer; `emailed` evita un correo por
  // cada mensaje cuando escriben cinco seguidos.
  pendingEmail: { userId: string; since: Date; emailed: boolean }[];
  meta?: {
    // Adopción
    adoptionId?: string;
    animalId?: string;
    shelterId?: string;
    adopterId?: string;
    // Cita veterinaria
    appointmentId?: string;
    vetId?: string;
    ownerId?: string;
    // Restos de RentalApp que aún lee stripe.webhook (contractId…).
    [legacy: string]: string | undefined;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const ConversationSchema = new Schema<IConversation>({
  kind: { type: String, required: true },
  refId: { type: String, required: true },
  participants: { type: [String], required: true },
  lastMessageAt: Date,
  unread: { type: Schema.Types.Mixed, default: {} },
  pendingEmail: {
    type: [new Schema({ userId: String, since: Date, emailed: { type: Boolean, default: false } }, { _id: false })],
    default: [],
  },
  meta: { type: Schema.Types.Mixed },
}, { timestamps: true });

ConversationSchema.index({ kind: 1, refId: 1 }, { unique: true });
ConversationSchema.index({ participants: 1, lastMessageAt: -1 });
ConversationSchema.index({ 'pendingEmail.emailed': 1, 'pendingEmail.since': 1 });

export default model<IConversation>('Conversation', ConversationSchema);
