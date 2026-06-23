import { api as client } from './client';

export type AnimalStatus =
  | 'borrador'
  | 'publicado'
  | 'reservado'
  | 'preadoptado'
  | 'adoptado'
  | 'no_disponible'
  | 'archivado';
export type AnimalMood = 'relajado' | 'timido' | 'energico' | 'en_adaptacion';

export type AnimalSearchParams = {
  q?: string;
  species?: string;
  size?: 'small' | 'medium' | 'large';
  sex?: 'male' | 'female';
  status?: AnimalStatus;
  shelter?: string;
  code?: string;
  sort?: 'createdAt' | 'name';
  dir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
};

export async function searchAnimals(params: AnimalSearchParams = {}) {
  const { data } = await client.get('/api/animals', { params });
  return data as { items: any[]; page: number; limit: number; total: number };
}

export async function getAnimal(id: string) {
  const { data } = await client.get(`/api/animals/${id}`);
  return data;
}

export async function getAnimalByCode(code: string) {
  const { data } = await client.get(`/api/animals/code/${encodeURIComponent(code)}`);
  return data;
}

export async function createAnimal(payload: any) {
  const { data } = await client.post('/api/animals', payload);
  return data;
}

export async function updateAnimal(id: string, payload: any) {
  const { data } = await client.put(`/api/animals/${id}`, payload);
  return data;
}

export async function deleteAnimal(id: string) {
  const { data } = await client.delete(`/api/animals/${id}`);
  return data;
}

export async function updateAnimalStatus(id: string, status: AnimalStatus) {
  const { data } = await client.patch(`/api/animals/${id}/status`, { status });
  return data as { _id: string; status: AnimalStatus };
}

export async function markAnimalFeeding(id: string) {
  const { data } = await client.post(`/api/animals/${id}/care/feed`);
  return data as { ok: boolean; lastFeeding: string };
}

export async function markAnimalLitter(id: string) {
  const { data } = await client.post(`/api/animals/${id}/care/litter`);
  return data as { ok: boolean; lastLitterChange: string };
}

export type UserPet = {
  type: 'personal' | 'adopted';
  adoptionId?: string;
  animal: any;
};

export async function listMyPets() {
  const { data } = await client.get('/api/animals/mine');
  return data as { items: UserPet[] };
}

export async function createPersonalPet(payload: {
  name: string;
  species: string;
  age: string;
  images?: string[];
  mood?: string;
  sex?: 'male' | 'female';
  size?: 'small' | 'medium' | 'large';
}, token?: string) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const { data } = await client.post('/api/animals/personal', payload, { headers });
  return data;
}
