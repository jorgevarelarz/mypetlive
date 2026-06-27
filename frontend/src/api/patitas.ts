import { api as client } from './client';

export type PatitaTxn = {
  id: string;
  type: 'earn' | 'donate' | 'redeem';
  amount: number;
  valueEur?: number;
  source?: 'coupon' | 'visit' | 'manual';
  status: string;
  code?: string;
  concept?: string;
  user?: { id: string; name?: string };
  shelter?: { id: string; name?: string };
  partner?: { id: string; name?: string };
  createdAt: string;
};

export type MyPatitas = {
  balance: number;
  valueEur: number;
  patitaValueEur: number;
  totalGenerated: number;
  autoDonate: { enabled: boolean; shelterId?: string };
  history: PatitaTxn[];
};

export async function getMyPatitas() {
  const { data } = await client.get('/api/patitas/me');
  return data as MyPatitas;
}

export async function getPatitasHistory(type?: 'earn' | 'donate' | 'redeem') {
  const { data } = await client.get('/api/patitas/history', { params: type ? { type } : {} });
  return data as { items: PatitaTxn[] };
}

export async function listProtectoras() {
  const { data } = await client.get('/api/protectoras');
  return data as { items: { id: string; name: string }[] };
}

export async function donatePatitas(payload: { shelterId: string; amount: number }) {
  const { data } = await client.post('/api/patitas/donate', payload);
  return data as { ok: boolean; balance: number; shelterName?: string };
}

export async function earnVisit(userId: string) {
  const { data } = await client.post('/api/patitas/earn/visit', { userId });
  return data as { ok: boolean; earned: number; balance: number; autoDonated: boolean; shelterId?: string };
}

export async function getWalletToken() {
  const { data } = await client.get('/api/patitas/wallet/token');
  return data as { token: string; code: string; balance: number; valueEur: number };
}

export type RedeemPreview = {
  shelter: { id: string; name?: string };
  available: number;
  amount: number;
  valueEur: number;
  patitaValueEur: number;
};

export async function redeemPreview(payload: { walletToken?: string; code?: string; amount?: number | 'all' }) {
  const { data } = await client.post('/api/patitas/redeem/preview', payload);
  return data as RedeemPreview;
}

export async function redeemConfirm(payload: { walletToken?: string; code?: string; amount: number | 'all' }) {
  const { data } = await client.post('/api/patitas/redeem/confirm', payload);
  return data as {
    ok: boolean;
    code: string;
    patitas: number;
    valueEur: number;
    payoutStatus: 'paid' | 'pending_payout';
    shelter: { id: string; name?: string };
    newShelterBalance: number;
  };
}

// --- "Dar Patita" social (apoyo con un click, acredita a la protectora) ---
export async function echoPatita(payload: { shelterId: string; animalId?: string | null }) {
  const { data } = await client.post('/api/patitas/echo', payload);
  return data as { ok: boolean; newBalance: number };
}

// --- Gasto directo de la protectora en un partner (flujo legado) ---
export async function spendPatitas(payload: { amount: number; partnerType: 'store' | 'vet'; concept: string; animalId?: string; couponId?: string }) {
  const { data } = await client.post('/api/patitas/spend', payload);
  return data as { ok: boolean; newBalance: number };
}

// --- legado (dashboard de protectora / admin) ---
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
