import { api as client } from './client';

// Particulares autorizados que buscan casa a un animal suyo (cesión gratuita).

export type RehomeRequest = {
  adoptionId: string;
  adopterName: string;
  status: string;
  createdAt: string;
  contract: { signedByMe: boolean; signatures: number; completedAt?: string; titleChangedAt?: string } | null;
};

export type RehomeAnimal = {
  _id: string;
  name: string;
  species: string;
  sex?: string;
  birthDate?: string;
  images: string[];
  status: string;
  city?: string;
  code?: string;
  cession: { microchip: string };
  tooYoung: boolean;
  availableFrom?: string;
  requests: RehomeRequest[];
};

export type CessionContract = {
  adoptionId: string;
  text: string;
  animal: { name: string; species: string; microchip: string };
  role: 'from' | 'to';
  fromName?: string;
  toName?: string;
  signatures: Array<{ who: 'from' | 'to'; fullName: string; at: string }>;
  signedByMe: boolean;
  completedAt?: string;
  titleChangedAt?: string;
  cancelledAt?: string;
};

export async function getRehomeStatus() {
  const { data } = await client.get<{ enabled: boolean }>('/api/rehome/status');
  return data.enabled;
}

export async function adminSetRehome(userId: string, enabled: boolean) {
  const { data } = await client.patch(`/api/rehome/admin/users/${userId}`, { enabled });
  return data;
}

export async function listMyRehome() {
  const { data } = await client.get<{ items: RehomeAnimal[] }>('/api/rehome/animals');
  return data.items;
}

export async function createRehomeListing(body: Record<string, unknown>) {
  const { data } = await client.post('/api/rehome/animals', body);
  return data;
}

export async function withdrawRehome(animalId: string) {
  await client.post(`/api/rehome/animals/${animalId}/withdraw`);
}

export async function chooseAdopter(adoptionId: string) {
  await client.post(`/api/rehome/adoptions/${adoptionId}/choose`);
}

export async function rejectAdopter(adoptionId: string) {
  await client.post(`/api/rehome/adoptions/${adoptionId}/reject`);
}

export async function getCessionContract(adoptionId: string) {
  const { data } = await client.get<CessionContract>(`/api/rehome/contracts/${adoptionId}`);
  return data;
}

export async function signCessionContract(adoptionId: string, fullName: string) {
  const { data } = await client.post<{ ok: boolean; completed: boolean }>(`/api/rehome/contracts/${adoptionId}/sign`, { fullName });
  return data;
}

export async function markTitleChanged(adoptionId: string) {
  await client.post(`/api/rehome/contracts/${adoptionId}/title-changed`);
}

export const REHOME_ERRORS: Record<string, string> = {
  rehome_not_enabled: 'Tu cuenta no tiene activada esta opción.',
  invalid_microchip: 'El número de microchip tiene 15 cifras.',
  declaration_required: 'Tienes que marcar la declaración.',
  photo_required: 'Sube al menos una foto.',
  birth_date_required: 'En perros, gatos y hurones hace falta la fecha de nacimiento (la ley no deja cederlos antes de las 8 semanas).',
  invalid_birth_date: 'Revisa la fecha de nacimiento.',
  microchip_already_listed: 'Ya hay un anuncio abierto con ese microchip.',
  name_required: 'Ponle nombre.',
  invalid_species: 'Elige la especie.',
  too_young: 'Todavía no tiene 8 semanas: la ley no deja cederlo aún.',
  someone_else_chosen: 'Ya has elegido a otra persona. Recházala antes si cambias de idea.',
  already_chosen: 'Ya has elegido a esta persona.',
  adoption_already_closed: 'Esta solicitud ya está cerrada.',
  someone_chosen: 'Has elegido a alguien: rechaza esa solicitud antes de retirar el anuncio.',
  full_name_required: 'Escribe tu nombre y apellidos.',
  already_signed: 'Ya has firmado.',
  contract_cancelled: 'Este contrato se anuló.',
};

export const rehomeError = (e: any, fallback = 'No se pudo completar') => REHOME_ERRORS[e?.response?.data?.error] || fallback;
