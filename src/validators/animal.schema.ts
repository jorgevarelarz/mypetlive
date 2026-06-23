import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const statusEnum = z.enum(['borrador', 'publicado', 'reservado', 'preadoptado', 'adoptado', 'no_disponible', 'archivado']);
const moodEnum = z.enum(['relajado', 'timido', 'energico', 'en_adaptacion']);

export const animalCreateSchema = z.object({
  shelter: objectId,
  name: z.string().min(1),
  species: z.string().min(1),
  breed: z.string().optional(),
  sex: z.enum(['male', 'female']),
  age: z.string().min(1),
  size: z.enum(['small', 'medium', 'large']),
  status: statusEnum.optional(),
  story: z.string().max(5000).optional(),
  personality: z.array(z.string().min(1)).max(3).optional(),
  likes: z.array(z.string().min(1)).max(5).optional(),
  environment: z.array(z.string().min(1)).max(5).optional(),
  mood: moodEnum.optional().nullable(),
  description: z.string().max(8000).optional(),
  images: z.array(z.string().url()).max(20).optional(),
  vetHistory: z
    .array(
      z.object({
        date: z.string().transform(s => new Date(s)),
        note: z.string().min(1),
        treatment: z.string().optional(),
      }),
    )
    .optional(),
});

export const animalUpdateSchema = animalCreateSchema.partial();

export const animalStatusSchema = z.object({
  status: statusEnum,
});
