// Vocabulario de especie canónico. El alta histórica usaba inglés (cat/dog) y
// el seed español (gato/perro); unificamos a inglés en escritura y mantenemos
// sinónimos para casar datos legados en lecturas/targeting.

const CANONICAL: Record<string, string> = {
  cat: 'cat',
  gato: 'cat',
  dog: 'dog',
  perro: 'dog',
};

const SYNONYMS: Record<string, string[]> = {
  cat: ['cat', 'gato'],
  dog: ['dog', 'perro'],
};

// Canoniza una especie a su forma estándar (en minúsculas). Desconocidas se
// devuelven en minúsculas sin tocar (rabbit, bird, other, …).
export function normalizeSpecies(value?: string): string | undefined {
  if (value == null) return value as undefined;
  const k = String(value).trim().toLowerCase();
  if (!k) return k;
  return CANONICAL[k] || k;
}

// Todas las variantes equivalentes de una especie (para queries/targeting que
// deban casar datos legados es/en). Para desconocidas, su forma normalizada.
export function speciesVariants(value?: string): string[] {
  const norm = normalizeSpecies(value);
  if (!norm) return [];
  return SYNONYMS[norm] || [norm];
}

// ¿La lista de especies objetivo (de un cupón) casa con la especie del animal?
// Una lista vacía no restringe.
export function speciesMatches(target: string[] | undefined, animalSpecies?: string): boolean {
  if (!target?.length) return true;
  const variants = speciesVariants(animalSpecies);
  return target.some(s => variants.includes(normalizeSpecies(s) as string) || variants.includes(String(s).toLowerCase()));
}
