// Vacunas habituales en España por especie, para el alta de la mascota. La
// elegida va como nota del registro de salud («Vacuna: Rabia»); el aviso de la
// siguiente lo calcula el servidor con el intervalo de la categoría.
const VACCINES: Record<string, string[]> = {
  dog: ['Rabia', 'Polivalente (moquillo, parvovirus, hepatitis)', 'Leptospirosis', 'Tos de las perreras', 'Leishmaniosis'],
  cat: ['Trivalente felina', 'Rabia', 'Leucemia felina (FeLV)'],
  rabbit: ['Mixomatosis', 'Enfermedad hemorrágica vírica (RHD)'],
};

export function vaccinesFor(species?: string): string[] {
  const key = String(species || '').toLowerCase();
  const norm = key === 'perro' ? 'dog' : key === 'gato' ? 'cat' : key === 'conejo' ? 'rabbit' : key;
  return [...(VACCINES[norm] || []), 'Otra'];
}
