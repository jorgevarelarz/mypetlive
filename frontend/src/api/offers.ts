import { api as client } from './client';

export type Offer = {
  _id: string;
  title?: string;
  description?: string;
  discount?: string;
  bonusPatitas?: number;
  partnerType?: 'store' | 'vet';
  partner?: { id: string; name?: string };
  sponsored?: boolean;
  targetAnimalCode?: string;
  expiresAt?: string;
  exact?: boolean;
  pets?: { code: string; name: string }[];
};

// Ofertas personalizadas para un animal por su código (público).
export async function offersForAnimal(code: string) {
  const { data } = await client.get(`/api/offers/for-animal/${encodeURIComponent(code)}`);
  return data as { animal: { code: string; name: string; species?: string }; items: Offer[] };
}

// Ofertas para las mascotas del usuario autenticado.
export async function offersForMe() {
  const { data } = await client.get('/api/offers/for-me');
  return data as { items: Offer[] };
}
