// Huecos válidos de la agenda por defecto (L-V 10-13 y 16-18, hora de España).
// Desde AUD-2 la API rechaza horas fuera de agenda y cuenta citas pendientes, así
// que los tests ya no pueden pedir «mañana a esta hora + n».
import { DEFAULT_AGENDA, madridToDate } from '../../utils/vetAgenda';

/** El n-ésimo hueco laborable a partir de pasado mañana (siempre > margen de 2 h). */
export function hueco(n: number, now = new Date()): Date {
  const porDia = DEFAULT_AGENDA.horas.length;
  let dia = 2;
  let restantes = n;
  for (;;) {
    const d = new Date(now.getTime() + dia * 86_400_000);
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
    const [y, m, dd] = ymd.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    if (wd >= 1 && wd <= 5) {
      if (restantes < porDia) return madridToDate(ymd, DEFAULT_AGENDA.horas[restantes]);
      restantes -= porDia;
    }
    dia++;
  }
}
