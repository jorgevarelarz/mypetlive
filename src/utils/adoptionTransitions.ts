import type { AdoptionStatus } from '../models/adoption.model';

// Máquina de estados de la solicitud de adopción, tal y como la gestiona la
// protectora (o un admin) desde su panel. El servidor es la autoridad: la UI
// pinta los botones a partir del mismo mapa
// (frontend/src/utils/adoptionTransitions.ts, copia deliberada porque front y
// back no comparten build), pero quien decide es esto.
//
// Los tres estados finales no tienen salida a propósito. Aprobar traspasa el
// animal al adoptante —ownerId, isPersonalPet, status 'adoptado'— y deja un
// evento 'adopted' en el linaje; salir de 'aprobada' exigiría revertir ese
// traspaso, y no se revierte. Sin este mapa, pasar una adopción aprobada a
// 'rechazada' dejaba al animal como mascota personal del adoptante con la
// solicitud marcada como rechazada: dos verdades incompatibles en la base.
export const ADOPTION_TRANSITIONS: Record<AdoptionStatus, AdoptionStatus[]> = {
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

export const TERMINAL_ADOPTION_STATUSES: AdoptionStatus[] = ['aprobada', 'rechazada', 'cancelada'];

export function isTerminalAdoptionStatus(status: string): boolean {
  return TERMINAL_ADOPTION_STATUSES.includes(status as AdoptionStatus);
}

// Estados a los que se puede pasar desde `from`. Un estado desconocido no
// habilita nada: mejor bloquear que arrastrar un dato corrupto.
export function nextAdoptionStatuses(from: string): AdoptionStatus[] {
  return ADOPTION_TRANSITIONS[from as AdoptionStatus] ?? [];
}

export function canTransitionAdoption(from: string, to: string): boolean {
  return nextAdoptionStatuses(from).includes(to as AdoptionStatus);
}
