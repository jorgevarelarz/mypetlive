import { api as client } from './client';

export type AdminCoupon = {
  _id: string;
  partnerId: string;
  partner?: { _id: string; name?: string; role?: string };
  partnerType: 'store' | 'vet';
  copy: string;
  discount: string;
  targetAnimalCode?: string | null;
  targetSpecies?: string[];
  targetAgeGroup?: string[];
  targetSize?: string[];
  targetCity?: string | null;
  targetItems?: string[];
  sponsored?: boolean;
  active: boolean;
  expiresAt?: string | null;
  usedAt?: string | null;
  updatedAt?: string;
};

export type CouponTargeting = {
  targetSpecies?: string[];
  targetAgeGroup?: string[];
  targetSize?: string[];
  targetCity?: string | null;
  targetItems?: string[];
  sponsored?: boolean;
};

export type CouponPartnerOption = {
  _id: string;
  name?: string;
  email?: string;
  role: 'store' | 'vet';
};

export async function getAllCoupons() {
  const { data } = await client.get('/api/admin/coupons');
  return data as { items: AdminCoupon[] };
}

export async function getCouponPartners() {
  const { data } = await client.get('/api/admin/coupons/partners');
  return data as { items: CouponPartnerOption[] };
}

export async function createCoupon(payload: {
  copy: string;
  discount: string;
  partnerId: string;
  targetAnimalCode?: string;
  expiresAt?: string | null;
} & CouponTargeting) {
  const { data } = await client.post('/api/admin/coupons', payload);
  return data as AdminCoupon;
}

export async function updateCoupon(id: string, payload: {
  copy?: string;
  discount?: string;
  partnerId?: string;
  targetAnimalCode?: string | null;
  expiresAt?: string | null;
} & CouponTargeting) {
  const { data } = await client.patch(`/api/admin/coupons/${id}`, payload);
  return data as AdminCoupon;
}

export async function toggleCoupon(id: string) {
  const { data } = await client.patch(`/api/admin/coupons/${id}/toggle`);
  return data as AdminCoupon;
}
