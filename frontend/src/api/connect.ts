import { api as client } from './client';

export type ConnectStatus = {
  connected: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  requirements?: any;
};

// Estado de la cuenta de cobro (Stripe Connect) de la protectora.
export async function getShelterConnectStatus(): Promise<ConnectStatus> {
  const { data } = await client.get('/api/connect/shelter/status');
  return data as ConnectStatus;
}

// Crea/recupera la cuenta y devuelve el enlace de onboarding KYC de Stripe.
export async function createShelterConnectLink(): Promise<{ accountId: string; url: string }> {
  const { data } = await client.post('/api/connect/shelter/link', {});
  return data as { accountId: string; url: string };
}

// Estado de la cuenta de cobro (Stripe Connect) de una tienda/veterinario.
export async function getPartnerConnectStatus(): Promise<ConnectStatus> {
  const { data } = await client.get('/api/connect/partner/status');
  return data as ConnectStatus;
}

export async function createPartnerConnectLink(): Promise<{ accountId: string; url: string }> {
  const { data } = await client.post('/api/connect/partner/link', {});
  return data as { accountId: string; url: string };
}
