// Cuándo toca cada toma de una medicación. Se calcula desde la primera toma
// (`firstDoseAt`) y la frecuencia, sin guardar una lista de tomas.
//
// Las pautas por horas son intervalos exactos: un antibiótico cada 8 horas sigue
// cada 8 horas aunque cambie la hora del reloj. Las de días, semanas y meses
// mantienen la hora de España: la pastilla de las 8 sigue siendo a las 8.
// El frontend hace lo mismo con la hora del móvil (frontend/src/utils/medicationDoses.ts).

const TZ = 'Europe/Madrid';
const H_MS = 3_600_000;
const DAY_MS = 24 * H_MS;
const CADA_HORAS: Record<string, number> = { every_6h: 6, every_8h: 8, every_12h: 12 };
const CADA_DIAS: Record<string, number> = { daily: 1, every_2_days: 2, weekly: 7 };

type Pauta = { firstDoseAt?: Date | string | null; frequency?: string | null; endsAt?: Date | string | null };

function madridParts(t: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(t);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

/** El instante que en España marca esa fecha y hora. */
function madridInstant(y: number, m: number, d: number, h: number, min: number) {
  const reloj = Date.UTC(y, m - 1, d, h, min);
  const desfase = (t: number) => {
    const p = madridParts(new Date(t));
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - t;
  };
  return new Date(reloj - desfase(reloj - desfase(reloj)));
}

const diaMadrid = (t: Date) => {
  const p = madridParts(t);
  return p.y * 10_000 + p.m * 100 + p.d;
};

/** La toma número `n` (0 = la primera), o null si la frecuencia no tiene calendario. */
function tomaNumero(primera: Date, frequency: string, n: number): Date | null {
  if (CADA_HORAS[frequency]) return new Date(primera.getTime() + n * CADA_HORAS[frequency] * H_MS);
  const p = madridParts(primera);
  if (CADA_DIAS[frequency]) {
    const dia = new Date(Date.UTC(p.y, p.m - 1, p.d + n * CADA_DIAS[frequency]));
    return madridInstant(dia.getUTCFullYear(), dia.getUTCMonth() + 1, dia.getUTCDate(), p.h, p.min);
  }
  if (frequency === 'monthly') {
    const mes = new Date(Date.UTC(p.y, p.m - 1 + n, 1));
    const ultimoDia = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 0)).getUTCDate();
    return madridInstant(mes.getUTCFullYear(), mes.getUTCMonth() + 1, Math.min(p.d, ultimoDia), p.h, p.min);
  }
  return null;
}

/** La última toma que ya ha tocado y la siguiente; null donde no hay ninguna. */
export function tomasCerca(pauta: Pauta, now: Date): { anterior: Date | null; siguiente: Date | null } {
  const { firstDoseAt, frequency, endsAt } = pauta;
  if (!firstDoseAt || !frequency) return { anterior: null, siguiente: null };
  const primera = new Date(firstDoseAt);
  const toma = (n: number) => tomaNumero(primera, frequency, n);
  if (!toma(0)) return { anterior: null, siguiente: null };

  const dentro = (t: Date | null) => (t && (!endsAt || diaMadrid(t) <= diaMadrid(new Date(endsAt))) ? t : null);
  if (now.getTime() < primera.getTime()) return { anterior: null, siguiente: dentro(primera) };

  const aprox = CADA_HORAS[frequency] ? CADA_HORAS[frequency] * H_MS : CADA_DIAS[frequency] ? CADA_DIAS[frequency] * DAY_MS : 28 * DAY_MS;
  let n = Math.floor((now.getTime() - primera.getTime()) / aprox);
  while (n > 0 && (toma(n) as Date).getTime() > now.getTime()) n -= 1;
  while ((toma(n + 1) as Date).getTime() <= now.getTime()) n += 1;
  return { anterior: dentro(toma(n)), siguiente: dentro(toma(n + 1)) };
}
