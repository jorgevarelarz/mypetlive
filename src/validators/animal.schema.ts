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
  ageGroup: z.enum(['puppy', 'young', 'adult', 'senior']).optional(),
  city: z.string().max(120).optional(),
  size: z.enum(['small', 'medium', 'large']),
  goodWithChildren: z.boolean().optional(),
  goodWithDogs: z.boolean().optional(),
  goodWithCats: z.boolean().optional(),
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

// Las fotos las sirve `POST /api/uploads`, que devuelve una URL absoluta, pero
// una ficha antigua puede guardar la ruta relativa: aceptamos las dos formas y
// ninguna más (nada de `javascript:` ni de `data:` colándose en un `<img>`).
const petImage = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine(v => /^https?:\/\//i.test(v) || v.startsWith('/uploads/'), 'invalid_image_url');

// Lo que la familia puede corregir de su propia mascota. Zod descarta lo que no
// esté aquí, así que `status`, `shelter` y `ownerId` —que los gobierna el
// circuito de adopción— no se pueden mover desde este endpoint aunque viajen en
// el cuerpo de la petición.
export const personalPetUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  species: z.string().trim().min(1).max(40).optional(),
  breed: z.string().trim().max(80).optional(),
  age: z.string().trim().min(1).max(40).optional(),
  // `nullable` como `mood`: quien se equivocó al darla de alta tiene que poder
  // dejarlo en blanco otra vez, no solo cambiarlo por el otro valor.
  sex: z.enum(['male', 'female']).nullable().optional(),
  size: z.enum(['small', 'medium', 'large']).nullable().optional(),
  mood: moodEnum.nullable().optional(),
  images: z.array(petImage).max(20).optional(),
});

export const animalStatusSchema = z.object({
  status: statusEnum,
});
