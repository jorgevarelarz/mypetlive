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

// El servidor topa `limit` en 100 (`Math.min(100, …)` en animal.controller.search),
// así que un panel que pedía 200 recibía 100 en silencio: por encima de 100 fichas
// el listado quedaba truncado sin avisar y cualquier contador derivado mentía.
// Paginamos hasta `maxItems`, devolvemos el `total` real del servidor y `truncated`
// para poder decir en pantalla que falta cola.
const SHELTER_ANIMALS_PAGE_SIZE = 100;

export async function listAllShelterAnimals(shelterId: string, maxItems = 400) {
  const fetchPage = (page: number) =>
    searchAnimals({ shelter: shelterId, page, limit: SHELTER_ANIMALS_PAGE_SIZE, sort: 'createdAt', dir: 'desc' });
  const first = await fetchPage(1);
  const items = [...(first.items || [])];
  const total = typeof first.total === 'number' ? first.total : items.length;
  const target = Math.min(total, maxItems);
  const lastPage = Math.ceil(maxItems / SHELTER_ANIMALS_PAGE_SIZE);
  for (let page = 2; items.length < target && page <= lastPage; page += 1) {
    const next = await fetchPage(page);
    if (!next.items?.length) break;
    items.push(...next.items);
  }
  return { items, total, truncated: total > items.length };
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

export type HealthCategory = 'visit' | 'vaccine' | 'deworming' | 'surgery' | 'checkup' | 'test' | 'other';

// Añade un registro clínico al animal por su código (alimenta el pasaporte).
// Lo usan el veterinario y también la familia desde la ficha de su mascota.
//
// `nextDueAt` decide si esto genera un aviso: una fecha lo programa, `null` lo
// desactiva a propósito, y omitirlo deja que el servidor ponga el intervalo
// habitual de la categoría (vacuna al año, desparasitación a los tres meses).
export async function addHealthRecord(
  code: string,
  payload: { category: HealthCategory; note: string; treatment?: string; date?: string; nextDueAt?: string | null },
) {
  const { data } = await client.post(`/api/animals/${encodeURIComponent(code)}/health`, payload);
  return data as {
    ok: boolean;
    category: HealthCategory;
    nextDueAt: string | null;
    health: { vetVisits: number; healthMilestones: number };
  };
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

export type CareEntry = {
  _id: string;
  type: 'feed' | 'litter' | 'walk';
  actorName?: string;
  foods?: string[];
  litterType?: string;
  walk?: { kind?: string; minutes?: number; distanceKm?: number; place?: string };
  createdAt: string;
};

export type SupplyUnit = 'g' | 'kg' | 'ml' | 'l' | 'ud';

/**
 * Producto de la despensa. Las cantidades llegan en la unidad base de su familia
 * (g, ml, ud); `usesLeft`/`daysLeft` los calcula el servidor a partir del ritmo
 * real de consumo, y son `null` cuando no hay datos para afirmarlo.
 */
export type CareSupply = {
  name: string;
  unit?: SupplyUnit;
  packSize?: number;
  perUse?: number;
  remaining?: number;
  usesLeft: number | null;
  daysLeft: number | null;
  runningLow: boolean;
};

export type CarePantry = { foods: CareSupply[]; litters: CareSupply[] };

export type CareSummary = {
  feedings: number;
  litterChanges: number;
  walks: number;
  walkKm: number;
  walkMinutes: number;
};

// La despensa viaja en la respuesta de cada marca para que los chips de "lo de
// siempre" se actualicen sin una segunda petición.
export async function markAnimalFeeding(id: string, foods: string[] = []) {
  const { data } = await client.post(`/api/animals/${id}/care/feed`, { foods });
  return data as { ok: boolean; lastFeeding: string; entry: CareEntry; pantry: CarePantry };
}

export async function markAnimalLitter(id: string, litterType?: string) {
  const { data } = await client.post(`/api/animals/${id}/care/litter`, { litterType });
  return data as { ok: boolean; lastLitterChange: string; entry: CareEntry; pantry: CarePantry };
}

export async function markAnimalWalk(
  id: string,
  walk: { kind: string; minutes?: number; distanceKm?: number; place?: string },
) {
  const { data } = await client.post(`/api/animals/${id}/care/walk`, walk);
  return data as { ok: boolean; lastWalk: string; entry: CareEntry };
}

/** Alta, edición, reposición (`refill`) o baja (`remove`) de un producto. */
export async function upsertAnimalSupply(
  id: string,
  supply: {
    kind: 'food' | 'litter';
    name: string;
    packSize?: number;
    packUnit?: SupplyUnit;
    perUse?: number;
    perUseUnit?: SupplyUnit;
    refill?: boolean;
    remove?: boolean;
  },
) {
  const { data } = await client.put(`/api/animals/${id}/care/supplies`, supply);
  return data as { ok: boolean; pantry: CarePantry };
}

export async function getAnimalCare(id: string) {
  const { data } = await client.get(`/api/animals/${id}/care`);
  return data as {
    items: CareEntry[];
    summary: CareSummary;
    pantry: CarePantry;
    last: { feeding?: string; litterChange?: string; walk?: string };
  };
}

export type UserPet = {
  type: 'personal' | 'adopted';
  adoptionId?: string;
  animal: any;
};

export type PersonalPetUpdate = {
  name?: string;
  species?: string;
  breed?: string;
  age?: string;
  mood?: AnimalMood | null;
  sex?: 'male' | 'female' | null;
  size?: 'small' | 'medium' | 'large' | null;
  images?: string[];
};

// Edición de la ficha de una mascota propia (incluidas las fotos). Endpoint
// distinto de `updateAnimal`, que es el de las protectoras y exige rol landlord.
export async function updateMyPet(id: string, payload: PersonalPetUpdate) {
  const { data } = await client.put(`/api/animals/mine/${id}`, payload);
  return data;
}

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
