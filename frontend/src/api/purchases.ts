import { api as client } from './client';

export async function recordPurchase(payload: { animalId: string; amount: number; notes?: string }) {
  const { data } = await client.post('/api/purchases', payload);
  return data as { ok: boolean };
}
