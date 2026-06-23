import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

export const adoptionCreateSchema = z.object({
  animalId: objectId,
  message: z.string().max(500).optional(),
});

export const adoptionStatusSchema = z.object({
  status: z.enum([
    'en_revision',
    'info_adicional',
    'cita_propuesta',
    'preaprobada',
    'aprobada',
    'rechazada',
    'cancelada',
  ]),
  note: z.string().max(1000).optional(),
});

