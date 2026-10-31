// Igual que src/utils/age.ts del servidor: la edad se calcula de la fecha de
// nacimiento para que se actualice sola con cada cumpleaños.
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

/** Edad a mostrar: de la fecha si la hay; si no, el texto guardado (fichas viejas). */
export function petAge(animal?: { birthDate?: string | Date; age?: string } | null): string {
  if (!animal) return '';
  return animal.birthDate ? ageFromBirthDate(animal.birthDate) : animal.age || '';
}
