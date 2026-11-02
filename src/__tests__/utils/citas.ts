// Desde AUD-2 (FAC-116) un veterinario solo apunta en el pasaporte de un animal
// que atiende: con una cita suya no cancelada. Los tests de salud la crean aquí.
import mongoose from 'mongoose';
import { VetAppointment } from '../../models/vetAppointment.model';

export async function citaCon(vetId: string, animal: { _id: any; code?: string }, userId?: string) {
  return VetAppointment.create({
    vetId,
    userId: userId || new mongoose.Types.ObjectId().toHexString(),
    animalId: animal._id,
    animalCode: animal.code,
    reason: 'Revisión',
    requestedAt: new Date(Date.now() + 3 * 86_400_000),
    status: 'confirmed',
  });
}
