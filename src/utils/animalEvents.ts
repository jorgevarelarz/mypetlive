import { AnimalEvent } from '../models/animalEvent.model';

type LogInput = {
  animalId: string;
  code?: string;
  type: 'created' | 'published' | 'reserved' | 'adopted' | 'transferred' | 'returned' | 'vet' | 'health' | 'status';
  actorId?: string;
  fromOwnerId?: string;
  toOwnerId?: string;
  fromOwnerType?: 'protectora' | 'tenant';
  toOwnerType?: 'protectora' | 'tenant';
  shelterId?: string;
  data?: any;
};

// Registra un evento del pasaporte del animal. No lanza (no debe romper el flujo principal).
export async function logAnimalEvent(input: LogInput): Promise<void> {
  try {
    await AnimalEvent.create(input);
  } catch {
    // best-effort: el ledger de auditoría nunca bloquea la operación de negocio
  }
}
