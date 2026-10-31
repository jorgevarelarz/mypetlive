import type { AdoptionShelterStatus } from '../api/adoptions';

// Transiciones que ofrece un panel de gestión según el estado actual de la
// solicitud (dossier p.9). Copia deliberada de `src/utils/adoptionTransitions.ts`
// del backend, que es quien manda: front y back no comparten build, así que si
// tocas una tabla tienes que tocar la otra. La UI solo decide qué botones pinta;
// el servidor rechaza con 409 cualquier transición que no esté aquí.
//
// Los estados terminales quedan vacíos a propósito: desde `aprobada` el animal
// ya se ha traspasado al adoptante y pasarla a `rechazada` no revertiría el
// traspaso.
export const ADOPTION_TRANSITIONS: Record<string, AdoptionShelterStatus[]> = {
  recibida: ['en_revision', 'info_adicional', 'rechazada'],
  cuestionario_pendiente: ['en_revision', 'info_adicional', 'rechazada'],
  en_revision: ['cita_propuesta', 'info_adicional', 'preaprobada', 'rechazada'],
  info_adicional: ['en_revision', 'cita_propuesta', 'rechazada'],
  cita_propuesta: ['preaprobada', 'rechazada', 'cancelada'],
  preaprobada: ['aprobada', 'rechazada', 'cancelada'],
  aprobada: [],
  rechazada: [],
  cancelada: [],
};

export const TERMINAL_ADOPTION_STATUSES = ['aprobada', 'rechazada', 'cancelada'];

export function isTerminalAdoptionStatus(status?: string): boolean {
  return !!status && TERMINAL_ADOPTION_STATUSES.includes(status);
}

// Estados a los que se puede pasar desde `from`. Un estado desconocido no
// habilita nada.
export function nextAdoptionStatuses(from?: string): AdoptionShelterStatus[] {
  return (from && ADOPTION_TRANSITIONS[from]) || [];
}

// Los botones son acciones, no estados: "Rechazar", no "Rechazada".
export const ADOPTION_ACTION_LABEL: Record<AdoptionShelterStatus, string> = {
  en_revision: 'Pasar a revisión',
  info_adicional: 'Pedir información',
  cita_propuesta: 'Proponer cita',
  preaprobada: 'Preaprobar',
  aprobada: 'Aprobar adopción',
  rechazada: 'Rechazar',
  cancelada: 'Cancelar proceso',
};
