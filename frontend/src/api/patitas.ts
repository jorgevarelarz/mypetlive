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

// Identidad del usuario para ganar Patitas (el cliente muestra este QR/código).
export async function getMyCode() {
  const { data } = await client.get('/api/patitas/my-code');
  return data as { token: string; code: string };
}

// El partner identifica a un cliente por su QR/código.
export type EligibleCoupon = {
  _id: string;
  title?: string;
  discount?: string;
  bonusPatitas: number;
  targetAnimalCode: string | null;
};

export async function identifyUser(payload: { userToken?: string; code?: string }) {
  const { data } = await client.post('/api/patitas/identify', payload);
  // coupons: los elegibles de ESTE cliente en este establecimiento.
  return data as { userId: string; name?: string; email?: string; role?: string; coupons?: EligibleCoupon[] };
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

// Venta del partner: importe del ticket + líneas opcionales → comisión + Patitas proporcionales.
export type SaleItemInput = { name: string; qty?: number; priceEur?: number };

export async function registerSale(payload: { userId: string; amountEur: number; items?: SaleItemInput[] }) {
  const { data } = await client.post('/api/patitas/sales', payload);
  return data as { ok: boolean; saleId: string; commissionPct: number; commissionEur: number; patitasEarned: number; balance?: number; autoDonated?: boolean };
}

// Clave API del TPV del partner (integración de caja).
export async function getPosKeyStatus() {
  const { data } = await client.get('/api/partners/me/pos-key');
  return data as { configured: boolean; prefix: string | null };
}

export async function rotatePosKey() {
  const { data } = await client.post('/api/partners/me/pos-key');
  return data as { key: string; prefix: string };
}

// Claves del TPV con etiqueta y revocación individual (varias cajas) + modo test.
export type PosKey = {
  id: string;
  label: string;
  mode: 'live' | 'test';
  prefix: string | null;
  lastUsedAt: string | null;
  createdAt: string | null;
};

export async function listPosKeys() {
  const { data } = await client.get('/api/partners/me/pos-keys');
  return data as { keys: PosKey[] };
}

export async function createPosKey(payload: { label?: string; mode?: 'live' | 'test' }) {
  const { data } = await client.post('/api/partners/me/pos-keys', payload);
  return data as PosKey & { key: string };
}

export async function revokePosKey(keyId: string) {
  const { data } = await client.delete(`/api/partners/me/pos-keys/${keyId}`);
  return data as { ok: boolean };
}
