import { api as client } from './client';

export type VetCatalogService = {
  name: string;
  priceEur?: number;
  pricingType: 'fijo' | 'variable';
};

export type VetDirectoryItem = {
  _id: string;
  name: string;
  avatarUrl?: string;
  city?: string;
  specialties: string[];
  services: string[];
  serviceCatalog: VetCatalogService[];
  schedule?: string;
  emergency24h: boolean;
};

export type VetAppointmentStatus = 'requested' | 'confirmed' | 'rescheduled' | 'completed' | 'cancelled';

export type VetAppointment = {
  _id: string;
  vetId: any;
  userId: any;
  animalId?: any;
  animalCode?: string;
  reason: string;
  service?: VetCatalogService;
  requestedAt: string;
  scheduledAt?: string;
  status: VetAppointmentStatus;
  vetNotes?: string;
  cancelReason?: string;
  patitasCost?: number;
  patitasPaid?: boolean;
  payoutStatus?: 'none' | 'pending_payout' | 'paid';
  createdAt?: string;
};

export async function listVets(params?: { city?: string; q?: string }) {
  const { data } = await client.get('/api/vets', { params });
  return data as { items: VetDirectoryItem[] };
}

export async function createVetAppointment(payload: { vetId: string; reason: string; requestedAt: string; animalCode?: string; serviceName?: string; patitasCost?: number }) {
  const { data } = await client.post('/api/vet-appointments', payload);
  return data as VetAppointment;
}

export async function listMyVetAppointments(status?: VetAppointmentStatus) {
  const { data } = await client.get('/api/vet-appointments/mine', { params: status ? { status } : undefined });
  return data as { items: VetAppointment[] };
}

export async function updateVetAppointmentStatus(
  id: string,
  payload: { status: VetAppointmentStatus; scheduledAt?: string; vetNotes?: string; cancelReason?: string; addToHistory?: boolean },
) {
  const { data } = await client.patch(`/api/vet-appointments/${id}/status`, payload);
  return data as VetAppointment;
}
