// Cuándo toca cada toma, con la hora del móvil. Mismas reglas que
// src/utils/medicationDoses.ts del servidor, que es quien manda los avisos.

const H_MS = 3_600_000;
const CADA_HORAS: Record<string, number> = { every_6h: 6, every_8h: 8, every_12h: 12 };
const CADA_DIAS: Record<string, number> = { daily: 1, every_2_days: 2, weekly: 7 };
/** Marcada desde 90 minutos antes de la hora, esa toma cuenta como dada. */
export const DADA_ANTES_MS = 90 * 60_000;

type Pauta = { firstDoseAt?: string | null; frequency?: string | null; endsAt?: string | null; lastDoseAt?: string | null };

function tomaNumero(primera: Date, frequency: string, n: number): Date | null {
  if (CADA_HORAS[frequency]) return new Date(primera.getTime() + n * CADA_HORAS[frequency] * H_MS);
  if (CADA_DIAS[frequency]) {
    const t = new Date(primera);
    t.setDate(t.getDate() + n * CADA_DIAS[frequency]);
    return t;
  }
  if (frequency === 'monthly') {
    const t = new Date(primera.getFullYear(), primera.getMonth() + n, 1, primera.getHours(), primera.getMinutes());
    t.setDate(Math.min(primera.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
    return t;
  }
  return null;
}

const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const hora = (t: Date) => t.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

function cuando(t: Date, ahora: Date) {
  const manana = new Date(ahora);
  manana.setDate(manana.getDate() + 1);
  if (mismoDia(t, ahora)) return `hoy a las ${hora(t)}`;
  if (mismoDia(t, manana)) return `mañana a las ${hora(t)}`;
  return `el ${t.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')} a las ${hora(t)}`;
}

/** Qué decir de las tomas de un tratamiento y si se puede marcar una como dada. Null si no lleva avisos. */
export function estadoToma(pauta: Pauta, ahora: Date): { texto: string; marcar: boolean; pendiente: boolean } | null {
  const { firstDoseAt, frequency, endsAt, lastDoseAt } = pauta;
  if (!firstDoseAt || !frequency) return null;
  const primera = new Date(firstDoseAt);
  if (!tomaNumero(primera, frequency, 0)) return null;
  const toma = (n: number) => tomaNumero(primera, frequency, n) as Date;
  const dentro = (t: Date | null) => {
    if (!t || !endsAt) return t;
    const fin = new Date(endsAt);
    fin.setHours(23, 59, 59, 999);
    return t.getTime() <= fin.getTime() ? t : null;
  };

  let n = -1;
  while (toma(n + 1).getTime() <= ahora.getTime()) n += 1;
  const anterior = n >= 0 ? dentro(toma(n)) : null;
  const siguiente = dentro(toma(n + 1));
  const dada = (t: Date) => !!lastDoseAt && new Date(lastDoseAt).getTime() >= t.getTime() - DADA_ANTES_MS;

  if (anterior && !dada(anterior)) return { texto: `Toma de ${cuando(anterior, ahora).replace(/^hoy a las/, 'las')} sin marcar`, marcar: true, pendiente: true };
  if (!siguiente) return null;
  const cerca = siguiente.getTime() - ahora.getTime() <= DADA_ANTES_MS;
  return { texto: `Próxima toma: ${cuando(siguiente, ahora)}`, marcar: cerca && !dada(siguiente), pendiente: false };
}
