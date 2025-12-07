import { api as client } from './client';

export async function createDonationSession(amountEUR: number, animalId?: string) {
  const { data } = await client.post('/api/donations/checkout-session', { amountEUR, animalId });
  return data as { id: string; url: string };
}

