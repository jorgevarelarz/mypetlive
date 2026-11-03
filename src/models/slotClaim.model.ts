import { Schema, model } from 'mongoose';
import { minutoMadrid } from '../utils/vetAgenda';

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

// Por minuto en hora de España, como compara la agenda (AUD-3, FAC-130): con el
// instante exacto, 10:00:00 y 10:00:30 eran dos claves y dos citas en el hueco.
export const slotClaimId = (vetId: string, when: Date) => `${vetId}|${minutoMadrid(when)}`;

// Clave de antes de AUD-3 (instante exacto). Las reservas viejas siguen con ella;
// al reclamar un hueco también se mira (AUD-4) para no dar dos veces ese minuto.
export const slotClaimIdAntiguo = (vetId: string, when: Date) => `${vetId}|${when.toISOString()}`;
