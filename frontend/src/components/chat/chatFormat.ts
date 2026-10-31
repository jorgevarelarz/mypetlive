import { ADOPTION_STATUS_LABEL, type AdoptionStatus } from '../../api/adoptions';
import { MPL } from '../../styles/mypetlive';

const TZ = 'Europe/Madrid';

const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

/** Hora corta para la burbuja: «10:31». */
export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

/** Separador de día: «Hoy», «Ayer», «Martes» (esta semana) o «28 oct». */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const today = ymd(now);
  const yesterday = ymd(new Date(now.getTime() - 86_400_000));
  if (ymd(d) === today) return 'Hoy';
  if (ymd(d) === yesterday) return 'Ayer';
  if (now.getTime() - d.getTime() < 6 * 86_400_000) {
    const w = d.toLocaleDateString('es-ES', { timeZone: TZ, weekday: 'long' });
    return w[0].toUpperCase() + w.slice(1);
  }
  return d.toLocaleDateString('es-ES', { timeZone: TZ, day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function sameDay(a: string, b: string): boolean {
  return ymd(new Date(a)) === ymd(new Date(b));
}

/** Hora o fecha corta para la bandeja: «10:31», «Ayer», «28 oct». */
export function listTime(iso?: string, now = new Date()): string {
  if (!iso) return '';
  const label = dayLabel(iso, now);
  return label === 'Hoy' ? timeOf(iso) : label;
}

/** «sábado, 1 de noviembre · 11:00» para tarjetas de visita y cita. */
export function whenLong(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-ES', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  return `${day[0].toUpperCase() + day.slice(1)} · ${timeOf(iso)}`;
}

type Pill = { label: string; bg: string; color: string };

const ADOPTION_PILL: Partial<Record<AdoptionStatus, Pick<Pill, 'bg' | 'color'>>> = {
  recibida: { bg: MPL.olive100, color: MPL.oliveDark },
  cuestionario_pendiente: { bg: MPL.olive100, color: MPL.oliveDark },
  en_revision: { bg: MPL.teal100, color: MPL.tealDark },
  info_adicional: { bg: MPL.gold100, color: MPL.goldDark },
  cita_propuesta: { bg: MPL.gold100, color: MPL.goldDark },
  preaprobada: { bg: MPL.teal100, color: MPL.tealDark },
  aprobada: { bg: MPL.teal, color: '#fff' },
  rechazada: { bg: '#E7E1D5', color: MPL.muted },
  cancelada: { bg: '#E7E1D5', color: MPL.muted },
};

export function adoptionPill(status?: string): Pill | null {
  if (!status) return null;
  const s = status as AdoptionStatus;
  const c = ADOPTION_PILL[s] || { bg: '#E7E1D5', color: MPL.muted };
  return { label: ADOPTION_STATUS_LABEL[s] || status, ...c };
}

export const VET_PILL: Record<string, Pill> = {
  requested: { label: 'Solicitada', bg: MPL.gold100, color: MPL.goldDark },
  confirmed: { label: 'Confirmada', bg: MPL.teal100, color: MPL.tealDark },
  rescheduled: { label: 'Nueva fecha', bg: MPL.gold100, color: MPL.goldDark },
  completed: { label: 'Completada', bg: '#E7E1D5', color: MPL.muted },
  cancelled: { label: 'Cancelada', bg: MPL.coral100, color: MPL.coralDark },
};

/** Texto del último mensaje en la bandeja. */
export function previewOf(m: { type: string; body?: string; mine: boolean; hasAttachment: boolean } | null): string {
  if (!m) return '';
  if (m.type === 'system') return m.body || '';
  const text = m.body || (m.hasAttachment ? '📷 Foto' : '');
  return m.mine ? `Tú: ${text}` : text;
}
