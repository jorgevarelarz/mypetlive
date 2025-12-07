import { listMyAdoptions } from '../api/adoptions';
import { getAnimal, searchAnimals, listMyPets } from '../api/animals';

export type AnimalDoc = {
  _id?: string;
  id?: string;
  name?: string;
  species?: string;
  age?: string;
  images?: string[];
  shelter?: string;
  code?: string;
  lastFeeding?: string;
  lastLitterChange?: string;
  mood?: string | null;
  healthHistory?: Array<{
    date?: string;
    type?: string;
    notes?: string;
    vetId?: string;
  }>;
};

export async function fetchFeaturedAnimal(assignedId?: string | null): Promise<AnimalDoc | null> {
  const triedIds = new Set<string>();

  const enqueue = (value?: string | null) => {
    if (!value) return;
    triedIds.add(String(value));
  };

  enqueue(assignedId);

  const loadDetailed = async (): Promise<AnimalDoc | null> => {
    for (const id of Array.from(triedIds.values())) {
      try {
        const doc = await getAnimal(id);
        if (doc) return doc;
      } catch (error) {
        console.warn('[pet] Error cargando animal asignado', error);
      }
    }
    return null;
  };

  try {
    const myPets = await listMyPets();
    const preferred = assignedId
      ? myPets.items?.find(item => String(item.animal?._id || item.animal?.id) === assignedId)?.animal
      : myPets.items?.[0]?.animal;
    if (preferred) {
      if (preferred.images?.length) {
        return preferred;
      }
      enqueue(preferred._id || preferred.id);
    }
  } catch (error) {
    console.warn('[pet] No se pudieron obtener mascotas personales', error);
  }

  if (!assignedId) {
    try {
      const { items } = await listMyAdoptions();
      const adopted = (items || []).find((item: any) => {
        const status = String(item?.status || '').toLowerCase();
        return ['accepted', 'active'].includes(status) && (item?.animal?._id || item?.animalId);
      });
      if (adopted) {
        if (adopted.animal?.images?.length) {
          return adopted.animal;
        }
        enqueue(adopted.animal?._id || adopted.animalId);
      }
    } catch (error) {
      console.warn('[pet] No se pudieron obtener adopciones del usuario', error);
    }
  }

  const detailed = await loadDetailed();
  if (detailed) return detailed;

  try {
    const { items } = await searchAnimals({ species: 'cat', q: 'Popeye', limit: 1 });
    const fallback = items?.[0];
    if (fallback) {
      if (fallback.images?.length) {
        return fallback;
      }
      enqueue(fallback._id || fallback.id);
      return (await loadDetailed()) || fallback;
    }
  } catch (error) {
    console.warn('[pet] Error obteniendo fallback Popeye', error);
  }

  return null;
}
