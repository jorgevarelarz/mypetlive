import { api as client } from './client';

export type Coupon = {
  _id: string;
  partnerType: 'store' | 'vet';
  partnerId?: string;
  partner?: { _id: string; name?: string; role?: string };
  copy?: string;
  title: string;
  description: string;
  discount: string;
  active: boolean;
  targetAnimalCode?: string | null;
  bonusPatitas?: number | null;
  expiresAt?: string | null;
  usedAt?: string | null;
};

export async function listCoupons() {
  const { data } = await client.get('/api/coupons');
  return data as { items: Coupon[] };
}

export async function listAvailableCoupons(params: { code: string }) {
  const { data } = await client.get('/api/coupons/available', { params });
  return data as { items: Coupon[] };
}

export async function redeemCoupon(couponId: string, payload: { animalCode: string; logId?: string }) {
  const { data } = await client.post(`/api/coupons/${couponId}/use`, payload);
  return data as { ok: boolean; coupon: Coupon; logId?: string };
}

// Usa un cupón para un cliente identificado, generándole sus Patitas.
export async function applyCouponToCustomer(couponId: string, userId: string, animalCode?: string) {
  const { data } = await client.post(`/api/coupons/${couponId}/use`, { userId, animalCode });
  return data as { ok: boolean; coupon: Coupon; earn?: { earned: number; autoDonated: boolean } };
}
