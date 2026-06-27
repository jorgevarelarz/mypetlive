import { Schema, model } from 'mongoose';

/**
 * Ledger de eventos del ciclo de vida de un animal — el "pasaporte" del código único.
 * Audita propiedad, transferencias y eventos clave para datos + ofertas personalizadas.
 *
 *  - created:     alta del animal (por protectora o por usuario).
 *  - published / reserved / returned / status: cambios de estado.
 *  - adopted / transferred: cambio de dueño (from → to).
 *  - vet / health: hitos sanitarios (también viven en vetHistory/healthHistory del animal).
 */
const animalEventSchema = new Schema(
  {
    animalId: { type: Schema.Types.ObjectId, ref: 'Animal', required: true, index: true },
    code: { type: String, uppercase: true, index: true },
    type: {
      type: String,
      enum: ['created', 'published', 'reserved', 'adopted', 'transferred', 'returned', 'vet', 'health', 'status'],
      required: true,
    },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    fromOwnerId: { type: Schema.Types.ObjectId, ref: 'User' },
    toOwnerId: { type: Schema.Types.ObjectId, ref: 'User' },
    fromOwnerType: { type: String, enum: ['protectora', 'tenant'] },
    toOwnerType: { type: String, enum: ['protectora', 'tenant'] },
    shelterId: { type: Schema.Types.ObjectId, ref: 'User' },
    data: { type: Schema.Types.Mixed },
  },
  { timestamps: true, versionKey: false },
);

animalEventSchema.index({ animalId: 1, createdAt: 1 });

export const AnimalEvent = model('AnimalEvent', animalEventSchema);
