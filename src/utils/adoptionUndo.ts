import type { AdoptionStatus, IAdoptionHistoryItem } from '../models/adoption.model';

// Deshacer una aprobación NO es una transición de estado: `aprobada` sigue
// siendo terminal en `adoptionTransitions.ts`. Es una operación con nombre
// propio, ventana de tiempo y motivo obligatorio, porque no cambia un campo:
// revierte el traspaso del animal, retira el plan de bienvenida y reabre las
// candidaturas que se cerraron al adjudicarlo.
//
// La ventana existe porque el tiempo cambia la naturaleza del hecho: a las dos
// horas es un error de clic; a las tres semanas el animal lleva viviendo en
// otra casa y lo que corresponde es una devolución, que es otro proceso con su
// propio motivo. El admin no tiene ventana: si hay que arreglar algo raro, se
// arregla.
export const UNDO_APPROVAL_WINDOW_HOURS = (() => {
  const raw = Number(process.env.ADOPTION_UNDO_WINDOW_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 72;
})();

/** Estado al que vuelve la solicitud: el único desde el que se pudo aprobar. */
export const STATUS_BEFORE_APPROVAL: AdoptionStatus = 'preaprobada';

/**
 * Momento en que se aprobó, leído del historial (última entrada que puso el
 * estado en `aprobada`). Si no hay rastro devuelve null y la ventana se mide
 * contra `updatedAt`, que es lo mejor que se puede afirmar.
 */
export function findApprovalTimestamp(history?: IAdoptionHistoryItem[]): Date | null {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry?.action === 'status_change' && (entry.payload as any)?.status === 'aprobada' && entry.ts) {
      return new Date(entry.ts);
    }
  }
  return null;
}

export function hoursSince(from: Date, now: Date = new Date()): number {
  return (now.getTime() - from.getTime()) / 3_600_000;
}

/**
 * Estado en el que estaba una candidatura hermana antes de que la cerrásemos
 * automáticamente al adjudicar el animal.
 *
 * Desde el fix de la reversión guardamos `previousStatus` en el propio evento de
 * cierre, así que es un dato, no una reconstrucción. Para las cerradas antes de
 * eso se reconstruye mirando el último cambio de estado anterior al cierre, y si
 * tampoco lo hay se vuelve a `recibida`, que es donde nacen.
 */
export function statusBeforeAutoClose(
  history: IAdoptionHistoryItem[] | undefined,
  approvedAdoptionId: string,
): AdoptionStatus {
  if (!Array.isArray(history)) return 'recibida';

  const closeIndex = history.findIndex(
    entry =>
      entry?.action === 'status_change' &&
      (entry.payload as any)?.reason === 'animal_adopted' &&
      String((entry.payload as any)?.adoptionId) === String(approvedAdoptionId),
  );
  if (closeIndex === -1) return 'recibida';

  const recorded = (history[closeIndex].payload as any)?.previousStatus;
  if (typeof recorded === 'string' && recorded) return recorded as AdoptionStatus;

  for (let i = closeIndex - 1; i >= 0; i -= 1) {
    const status = (history[i]?.payload as any)?.status;
    if (history[i]?.action === 'status_change' && typeof status === 'string' && status) {
      return status as AdoptionStatus;
    }
  }
  return 'recibida';
}
