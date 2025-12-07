import { api as client } from './client';

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

export async function setAdoptionStatus(id: string, status: 'accepted' | 'rejected') {
  const { data } = await client.patch(`/api/adoptions/${id}/status`, { status });
  return data as { ok: boolean; id: string; status: string };
}

export async function getAdoption(id: string) {
  const { data } = await client.get(`/api/adoptions/${id}`);
  return data;
}
