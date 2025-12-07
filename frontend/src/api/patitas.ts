import { api as client } from './client';

export async function getPatitasBalance(shelterId?: string) {
  const params: Record<string, string> = {};
  if (shelterId) params.shelterId = shelterId;
  const { data } = await client.get('/api/protectora/patitas', { params });
  return data as { patitas: number; protectoraId?: string };
}

export async function addPatitas(protectoraId: string, amount: number) {
  const { data } = await client.post(`/api/protectora/${protectoraId}/patitas/add`, { amount });
  return data as { patitas: number; protectoraId?: string };
}

export async function echoPatita(payload: { shelterId: string; animalId?: string | null }) {
  const { data } = await client.post('/api/patitas/echo', payload);
  return data as { ok: boolean; newBalance: number };
}

export async function spendPatitas(payload: { amount: number; partnerType: 'store' | 'vet'; concept: string; animalId?: string; couponId?: string }) {
  const { data } = await client.post('/api/patitas/spend', payload);
  return data as { ok: boolean; newBalance: number };
}

export async function listPendingPatitas() {
  const { data } = await client.get('/api/patitas/pending');
  return data as { items: any[] };
}

export type ConfirmPatitaResponse = {
  ok: boolean;
  couponDonation?: { amount: number; shelterId: string; shelterName?: string };
};

export async function confirmPatita(payload: { logId: string; proofImageUrl: string; notes?: string; treatmentType?: string }) {
  const { data } = await client.post('/api/patitas/confirm', payload);
  return data as ConfirmPatitaResponse;
}
