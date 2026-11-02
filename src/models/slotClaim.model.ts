import { Schema, model } from 'mongoose';

// Hueco de agenda ya pedido (AUD-2, FAC-120). Comprobar «está libre» y crear la
// cita eran dos pasos, y dos familias pidiendo a la vez el mismo hueco se lo
// quedaban las dos. Ahora quien pide reclama antes el hueco aquí: el _id es
// «vetId|instante», único siempre (sin depender de un índice aparte), y solo
// uno de los dos lo consigue. Al cancelar la cita se suelta.
const slotClaimSchema = new Schema(
  {
    _id: { type: String, required: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'VetAppointment' },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
slotClaimSchema.index({ appointmentId: 1 });

export const SlotClaim = model('SlotClaim', slotClaimSchema);

export const slotClaimId = (vetId: string, when: Date) => `${vetId}|${when.toISOString()}`;
