// Agenda de un veterinario: qué días de la semana y a qué horas atiende citas
// pedidas desde MyPetLive. De ahí salen los huecos que ve la familia al reservar
// (días disponibles en verde, horas libres), en hora de España.
//
// Antes solo había `profile.vet.schedule`, un texto libre («L-V 10-14 y 17-20»)
// que no se puede convertir en huecos. Ese texto sigue existiendo como nota para
// las personas; la agenda es lo que entiende la máquina. Un veterinario que aún
// no la ha rellenado tiene la de por defecto: de lunes a viernes, mañana y tarde.

import { VetAppointment } from '../models/vetAppointment.model';

export type Agenda = { dias: number[]; horas: string[] };

/** 1 = lunes … 7 = domingo. */
export const DEFAULT_AGENDA: Agenda = {
  dias: [1, 2, 3, 4, 5],
  horas: ['10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00'],
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TZ = 'Europe/Madrid';
/** Lo que se puede reservar hacia delante. */
export const MAX_DIAS = 62;
/** Margen mínimo: no se pide una cita para dentro de diez minutos. */
const MARGEN_MS = 2 * 3_600_000;

/** Limpia lo que llega del formulario del perfil. Null si no hay nada aprovechable. */
export function normalizeAgenda(input: any): Agenda | null {
  if (!input || typeof input !== 'object') return null;
  const dias = Array.isArray(input.dias)
    ? [...new Set(input.dias.map(Number).filter((d: number) => Number.isInteger(d) && d >= 1 && d <= 7))].sort() as number[]
    : [];
  const horas = Array.isArray(input.horas)
    ? [...new Set(input.horas.map((h: any) => String(h).trim()).filter((h: string) => HHMM.test(h)))].sort().slice(0, 24) as string[]
    : [];
  if (!dias.length || !horas.length) return null;
  return { dias, horas };
}

export function agendaOf(vet: any): Agenda {
  return normalizeAgenda(vet?.profile?.vet?.agenda) || DEFAULT_AGENDA;
}

/** Partes de la fecha/hora en España para un instante. */
function madridParts(t: Date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(t)) p[part.type] = part.value;
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1;
  return { ymd: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, wd };
}

/** «2026-11-12» + «12:00» en hora de España → instante UTC (respeta el cambio de hora). */
export function madridToDate(ymd: string, hhmm: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const offset = (t: number) => {
    const p = madridParts(new Date(t));
    const [py, pm, pd] = p.ymd.split('-').map(Number);
    const [ph, pmi] = p.hhmm.split(':').map(Number);
    return Date.UTC(py, pm - 1, pd, ph, pmi) - t;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t);
}

/** Día siguiente en formato AAAA-MM-DD (aritmética de calendario, sin husos). */
function nextYmd(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  const n = new Date(Date.UTC(y, m - 1, d + 1));
  return n.toISOString().slice(0, 10);
}

function weekday(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

const ACTIVE = ['requested', 'confirmed', 'rescheduled'];

/** Claves «AAAA-MM-DD HH:MM» (hora de España) de las citas que ocupan hueco. */
async function ocupados(vetId: string, desde: Date, hasta: Date) {
  const citas = await VetAppointment.find({
    vetId,
    status: { $in: ACTIVE },
    $or: [{ scheduledAt: { $gte: desde, $lte: hasta } }, { scheduledAt: null, requestedAt: { $gte: desde, $lte: hasta } }],
  }).select('requestedAt scheduledAt').lean();
  const set = new Set<string>();
  for (const c of citas as any[]) {
    const p = madridParts(new Date(c.scheduledAt || c.requestedAt));
    set.add(`${p.ymd} ${p.hhmm}`);
  }
  return set;
}

/** ¿Está libre ese instante en la agenda del vet? (para no dar dos veces el mismo hueco). */
export async function slotTaken(vetId: string, when: Date) {
  const p = madridParts(when);
  const set = await ocupados(vetId, new Date(when.getTime() - 60_000), new Date(when.getTime() + 60_000));
  return set.has(`${p.ymd} ${p.hhmm}`);
}

/**
 * Huecos libres desde `desdeYmd` durante `dias` días: por cada día de la agenda,
 * las horas que no han pasado (con margen) y que nadie ha pedido ya.
 */
export async function availability(vet: any, desdeYmd: string, dias: number, now = new Date()) {
  const agenda = agendaOf(vet);
  const n = Math.max(1, Math.min(MAX_DIAS, Math.floor(dias)));
  const hoy = madridParts(now).ymd;
  let ymd = desdeYmd < hoy ? hoy : desdeYmd;
  const fechas: string[] = [];
  for (let i = 0; i < n; i++) { fechas.push(ymd); ymd = nextYmd(ymd); }
  const limite = madridToDate(nextYmd(hoy), '00:00').getTime() + (MAX_DIAS - 1) * 86_400_000;

  const desde = madridToDate(fechas[0], '00:00');
  const hasta = madridToDate(nextYmd(fechas[fechas.length - 1]), '00:00');
  const ocupado = await ocupados(String(vet._id), desde, hasta);

  return {
    agendaPropia: !!normalizeAgenda(vet?.profile?.vet?.agenda),
    agenda,
    dias: fechas.map(fecha => {
      if (!agenda.dias.includes(weekday(fecha))) return { fecha, horas: [] as string[] };
      const horas = agenda.horas.filter(h => {
        const t = madridToDate(fecha, h).getTime();
        return t >= now.getTime() + MARGEN_MS && t <= limite && !ocupado.has(`${fecha} ${h}`);
      });
      return { fecha, horas };
    }),
  };
}
