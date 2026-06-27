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
  city?: string;
  ageGroup?: 'puppy' | 'young' | 'adult' | 'senior';
  goodWithChildren?: boolean;
  goodWithDogs?: boolean;
  goodWithCats?: boolean;
  status?: AnimalStatus;
  shelter?: string;
  code?: string;
  sort?: 'createdAt' | 'name' | 'age';
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

export async function listFavoriteAnimals() {
  const { data } = await client.get('/api/animals/favorites');
  return data as { ids: string[]; items: any[] };
}

export async function addAnimalFavorite(id: string) {
  const { data } = await client.post(`/api/animals/${id}/favorite`);
  return data;
}

export async function removeAnimalFavorite(id: string) {
  const { data } = await client.delete(`/api/animals/${id}/favorite`);
  return data;
}

export async function importAnimalFavorites(ids: string[]) {
  const { data } = await client.post('/api/animals/favorites/import', { ids });
  return data as { ok: boolean; added: number };
}

export type AnimalAlertFilters = Pick<
  AnimalSearchParams,
  'q' | 'species' | 'size' | 'sex' | 'city' | 'ageGroup' | 'goodWithChildren' | 'goodWithDogs' | 'goodWithCats'
>;

export type AnimalAlert = {
  _id: string;
  filters: AnimalAlertFilters;
  active: boolean;
  matches: number;
  createdAt: string;
};

export async function listAnimalAlerts() {
  const { data } = await client.get('/api/animals/alerts');
  return data as { items: AnimalAlert[] };
}

export async function createAnimalAlert(filters: AnimalAlertFilters) {
  const { data } = await client.post('/api/animals/alerts', { filters });
  return data as AnimalAlert;
}

export async function updateAnimalAlert(id: string, payload: { active?: boolean; filters?: AnimalAlertFilters }) {
  const { data } = await client.patch(`/api/animals/alerts/${id}`, payload);
  return data as AnimalAlert;
}

export async function deleteAnimalAlert(id: string) {
  const { data } = await client.delete(`/api/animals/alerts/${id}`);
  return data as { ok: boolean };
}

export async function getAnimalByCode(code: string) {
  const { data } = await client.get(`/api/animals/code/${encodeURIComponent(code)}`);
  return data;
}

export type AnimalTimelineItem = { at: string; type: string; title: string; detail?: string };

export type AnimalPassport = {
  code: string;
  name: string;
  species?: string;
  breed?: string;
  age?: string;
  ageGroup?: string;
  sex?: string;
  size?: string;
  images: string[];
  personality: string[];
  status?: string;
  isPersonalPet?: boolean;
  provenance?: { shelterName?: string; city?: string } | null;
  health: { vetVisits: number; healthMilestones: number };
  timeline: AnimalTimelineItem[];
};

// Pasaporte público por código (sin datos personales del dueño).
export async function getAnimalPassport(code: string) {
  const { data } = await client.get(`/api/animals/passport/${encodeURIComponent(code)}`);
  return data as AnimalPassport;
}

// Línea de tiempo (auth opcional: el dueño/admin ve más detalle).
export async function getAnimalTimeline(code: string) {
  const { data } = await client.get(`/api/animals/${encodeURIComponent(code)}/timeline`);
  return data as { code: string; timeline: AnimalTimelineItem[] };
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
