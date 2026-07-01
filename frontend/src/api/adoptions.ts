import { api as client } from './client';

export type AdoptionStatus =
  | 'recibida'
  | 'cuestionario_pendiente'
  | 'en_revision'
  | 'info_adicional'
  | 'cita_propuesta'
  | 'preaprobada'
  | 'aprobada'
  | 'rechazada'
  | 'cancelada';

// Estados que la protectora puede fijar manualmente desde el panel.
export type AdoptionShelterStatus = Exclude<AdoptionStatus, 'recibida' | 'cuestionario_pendiente'>;

export const ADOPTION_STATUS_LABEL: Record<AdoptionStatus, string> = {
  recibida: 'Recibida',
  cuestionario_pendiente: 'Cuestionario pendiente',
  en_revision: 'En revisión',
  info_adicional: 'Información adicional',
  cita_propuesta: 'Cita propuesta',
  preaprobada: 'Preaprobada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
};

export async function createAdoption(animalId: string, message?: string, answers?: Array<{ question: string; answer: string }>) {
  const { data } = await client.post('/api/adoptions', { animalId, message, answers });
  return data as { ok: boolean; id: string; status: string };
}

export async function listMyAdoptions() {
  const { data } = await client.get('/api/adoptions/mine');
  return data as { items: any[]; page: number; limit: number; total: number };
}

export async function listAdoptionsForMyAnimals(params: { status?: string; page?: number; limit?: number } = {}) {
  const { data } = await client.get('/api/adoptions/for-my-animals', { params });
  return data as { items: any[]; page: number; limit: number; total: number };
}

export async function adminListAdoptions(params: { status?: string; page?: number; limit?: number } = {}) {
  const { data } = await client.get('/api/adoptions', { params });
  return data as { items: any[]; page: number; limit: number; total: number };
}

export async function setAdoptionStatus(id: string, status: AdoptionShelterStatus, note?: string) {
  const { data } = await client.patch(`/api/adoptions/${id}/status`, { status, note });
  return data as { ok: boolean; id: string; status: AdoptionStatus };
}

export async function getAdoption(id: string) {
  const { data } = await client.get(`/api/adoptions/${id}`);
  return data;
}

// El adoptante retira su propia solicitud (solo estados no terminales).
export async function cancelAdoption(id: string, note?: string) {
  const { data } = await client.post(`/api/adoptions/${id}/cancel`, { note });
  return data as { ok: boolean; id: string; status: AdoptionStatus };
}
