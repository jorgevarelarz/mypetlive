import { api as client } from './client';

export type VetOffer = {
  _id: string;
  copy: string;
  discount: string;
  serviceType?: string;
  targetSpecies: string[];
  targetAgeGroup: string[];
  targetSize: string[];
  targetCity?: string;
  sponsored?: boolean;
  active: boolean;
  expiresAt?: string | null;
  usedAt?: string | null;
};

export async function listVetOffers() {
  const { data } = await client.get('/api/vet/offers');
  return data as { items: VetOffer[] };
}

export async function createVetOffer(payload: {
  copy: string;
  discount: string;
  serviceType?: string;
  targetSpecies?: string[];
  targetAgeGroup?: string[];
  targetSize?: string[];
  targetCity?: string;
  expiresAt?: string | null;
}) {
  const { data } = await client.post('/api/vet/offers', payload);
  return data as VetOffer;
}

export async function toggleVetOffer(id: string) {
  const { data } = await client.patch(`/api/vet/offers/${id}/toggle`);
  return data as VetOffer;
}

export async function deleteVetOffer(id: string) {
  const { data } = await client.delete(`/api/vet/offers/${id}`);
  return data as { ok: boolean };
}
