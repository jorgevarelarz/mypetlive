import { Schema, model } from 'mongoose';

// Cita veterinaria entre un usuario (dueño/adoptante) y un veterinario.
// Flujo: requested → (confirmed | rescheduled) → completed, o cancelled en cualquier punto.
export const VET_APPOINTMENT_STATUSES = ['requested', 'confirmed', 'rescheduled', 'completed', 'cancelled'] as const;

const vetAppointmentSchema = new Schema(
  {
    vetId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    animalId: { type: Schema.Types.ObjectId, ref: 'Animal' },
    animalCode: { type: String, uppercase: true, trim: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    // Fecha/hora propuesta por el usuario y confirmada por el vet (puede diferir si reprograma).
    requestedAt: { type: Date, required: true },
    scheduledAt: { type: Date },
    status: { type: String, enum: VET_APPOINTMENT_STATUSES, default: 'requested', index: true },
    vetNotes: { type: String, trim: true, maxlength: 1000 },
    cancelReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

vetAppointmentSchema.index({ vetId: 1, status: 1, requestedAt: 1 });

export const VetAppointment = model('VetAppointment', vetAppointmentSchema);
