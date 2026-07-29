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

// `listForMyAnimals` topa `limit` en 50 en el servidor, así que un panel que pida
// 100 recibe 50 en silencio y sus contadores mienten. Paginamos hasta `maxItems`
// para que "abiertas/aprobadas/cerradas" cuenten sobre todo el histórico, y
// devolvemos `truncated` para poder decirlo cuando ni así cabe.
const SHELTER_PAGE_SIZE = 50;

export async function listAllAdoptionsForMyAnimals(maxItems = 400) {
  const first = await listAdoptionsForMyAnimals({ page: 1, limit: SHELTER_PAGE_SIZE });
  const items = [...(first.items || [])];
  const total = typeof first.total === 'number' ? first.total : items.length;
  const target = Math.min(total, maxItems);
  const lastPage = Math.ceil(maxItems / SHELTER_PAGE_SIZE);
  for (let page = 2; items.length < target && page <= lastPage; page += 1) {
    const next = await listAdoptionsForMyAnimals({ page, limit: SHELTER_PAGE_SIZE });
    if (!next.items?.length) break;
    items.push(...next.items);
  }
  return { items, total, truncated: total > items.length };
}

export async function adminListAdoptions(params: { status?: string; page?: number; limit?: number } = {}) {
  const { data } = await client.get('/api/adoptions', { params });
  return data as { items: any[]; page: number; limit: number; total: number };
}

// Las tres pantallas que la llaman ya toastean su propio error (y traducen el
// 409 de transición ilegal); sin `skipErrorToast` salían dos avisos, uno de
// ellos con el código crudo del backend.
export async function setAdoptionStatus(id: string, status: AdoptionShelterStatus, note?: string) {
  const { data } = await client.patch(
    `/api/adoptions/${id}/status`,
    { status, note },
    { skipErrorToast: true } as any,
  );
  return data as { ok: boolean; id: string; status: AdoptionStatus };
}

/**
 * Traduce los errores de `setAdoptionStatus`. El servidor responde 409 cuando la
 * transición no es legal; sin esto la UI pintaba el código crudo
 * (`adoption_already_closed`) en un toast.
 */
export function adoptionStatusErrorMessage(error: any): string {
  const code = error?.response?.data?.error;
  if (code === 'adoption_already_closed') {
    return 'Este proceso ya está cerrado y no admite más cambios de estado.';
  }
  if (code === 'invalid_transition') {
    return 'Ese cambio de estado no es posible desde la situación actual. Recarga la página para ver el estado real.';
  }
  return 'No se pudo actualizar el estado.';
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
