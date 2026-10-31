import { api as client } from './client';

// Animales encontrados por particulares autorizados.

export type FoundAnimal = {
  _id: string;
  name?: string;
  species: string;
  sex?: string;
  approxAge?: string;
  images: string[];
  foundAt: string;
  foundPlace: string;
  city?: string;
  description?: string;
  status: 'buscando' | 'acogida_pedida' | 'en_acogida' | 'reunido' | 'retirado';
  publishedAt: string;
  mine: boolean;
  finderName?: string;
  // Solo para quien lo encontró:
  chip?: { result: 'none' | 'has_chip'; vetName?: string; at: string } | null;
  council?: { who: string; at: string } | null;
  foster?: { shelterId: string; intent: 'find_home' | 'keep'; requestedAt: string; acceptedAt?: string; rejectedAt?: string; signatures?: Array<{ fullName: string; at: string }> } | null;
  animalId?: string;
  readyAt?: string;
  blockers?: Array<'chip' | 'council' | 'wait'>;
};

export const listFound = async () => (await client.get<{ items: FoundAnimal[] }>('/api/found')).data.items;
export const getFound = async (id: string) => (await client.get<FoundAnimal>(`/api/found/${id}`)).data;
export const listMyFound = async () => (await client.get<{ items: FoundAnimal[] }>('/api/found/mine')).data.items;
export const createFound = async (body: Record<string, unknown>) => (await client.post<FoundAnimal>('/api/found', body)).data;
export const updateFoundSteps = async (id: string, body: Record<string, unknown>) => (await client.patch<FoundAnimal>(`/api/found/${id}/steps`, body)).data;
export const closeFound = async (id: string, reason: 'reunido' | 'retirado') => (await client.post<FoundAnimal>(`/api/found/${id}/close`, { reason })).data;
export const claimFound = async (id: string) => (await client.post<{ conversationId: string }>(`/api/found/${id}/claim`)).data;
export const listFosterShelters = async () => (await client.get<{ items: Array<{ id: string; name: string; city?: string }> }>('/api/found/shelters')).data.items;
export const requestFoster = async (id: string, body: { shelterId: string; intent: 'find_home' | 'keep'; message?: string }) => (await client.post<FoundAnimal>(`/api/found/${id}/foster`, body)).data;
export const acceptFoster = async (id: string) => { await client.post(`/api/found/${id}/foster/accept`); };
export const rejectFoster = async (id: string) => { await client.post(`/api/found/${id}/foster/reject`); };
export const getFosterAgreement = async (id: string) => (await client.get<{
  foundId: string; name?: string; text: string; role: 'finder' | 'shelter'; acceptedAt?: string;
  signatures: Array<{ fullName: string; at: string }>; animalId?: string; status: string;
}>(`/api/found/${id}/agreement`)).data;
export const signFosterAgreement = async (id: string, fullName: string) => (await client.post<{ ok: boolean; animalId: string; adoptionId?: string }>(`/api/found/${id}/agreement/sign`, { fullName })).data;

export const FOUND_ERRORS: Record<string, string> = {
  rehome_not_enabled: 'Tu cuenta no tiene activada esta opción.',
  invalid_species: 'Elige la especie.',
  invalid_found_date: 'Revisa la fecha en que lo encontraste.',
  found_place_required: 'Indica dónde lo encontraste.',
  photo_required: 'Sube al menos una foto.',
  council_who_required: 'Indica a quién avisaste.',
  steps_pending: 'Antes tienes que completar los pasos.',
  already_requested: 'Ya has pedido ayuda a una protectora.',
  shelter_not_found: 'Esa protectora no está disponible.',
  full_name_required: 'Escribe tu nombre y apellidos.',
  own_found: 'Es el animal que tú encontraste.',
  not_pending: 'Esta petición ya está respondida.',
};
export const foundError = (e: any, fallback = 'No se pudo completar') => FOUND_ERRORS[e?.response?.data?.error] || fallback;
