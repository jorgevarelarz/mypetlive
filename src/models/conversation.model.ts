import { Schema, model, Document } from 'mongoose';

export interface IConversation extends Document {
  kind: 'contract' | 'ticket' | 'appointment' | 'application' | 'adoption';
  refId: string;
  participants: string[]; // exactly 2
  lastMessageAt?: Date;
  unread: Record<string, number>;
  meta?: {
    contractId?: string;
    ticketId?: string;
    proUserId?: string;
    tenantId?: string;
    ownerId?: string;
    propertyId?: string;
    appointmentId?: string;
    applicationId?: string;
    // Chat de adopción (MyPetLive)
    adoptionId?: string;
    animalId?: string;
    shelterId?: string;
    adopterId?: string;
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
  meta: { type: Schema.Types.Mixed },
}, { timestamps: true });

ConversationSchema.index({ kind: 1, refId: 1 }, { unique: true });
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

export default model<IConversation>('Conversation', ConversationSchema);
