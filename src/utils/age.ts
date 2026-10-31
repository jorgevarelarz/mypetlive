/**
 * Edad legible a partir de la fecha de nacimiento («3 meses», «1 año»,
 * «2 años»). La ficha guarda `birthDate` y `age` se recalcula con ella para
 * que no se quede vieja con cada cumpleaños.
 */
export function ageFromBirthDate(birth: Date | string, now: Date = new Date()): string {
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return '';
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months -= 1;
  if (months < 1) return 'Menos de 1 mes';
  if (months < 12) return months === 1 ? '1 mes' : `${months} meses`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 año' : `${years} años`;
}

/** Fecha de nacimiento válida: AAAA-MM-DD, real, no futura y de los últimos 40 años. */
export function parseBirthDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  const now = Date.now();
  if (d.getTime() > now + 24 * 3600e3) return null;
  if (now - d.getTime() > 40 * 365.25 * 24 * 3600e3) return null;
  return d;
}
