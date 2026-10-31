import { speciesFilter } from '../utils/species';

/**
 * Filtro por especie de Compañeros (21-10-2026). La lista mandaba «perro» y la
 * base guarda «dog»: comparando literal no salía ningún animal. «Otros» es todo
 * lo que no es gato, perro ni reptil.
 */
describe('speciesFilter', () => {
  it('casa las variantes en español e inglés', () => {
    expect(speciesFilter('perro')).toEqual({ $in: ['dog', 'perro'] });
    expect(speciesFilter('cat')).toEqual({ $in: ['cat', 'gato'] });
  });

  it('reptil incluye los animales concretos', () => {
    const f = speciesFilter('reptil');
    expect(f.$in).toEqual(expect.arrayContaining(['reptile', 'tortuga', 'iguana']));
  });

  it('otros excluye gato, perro y reptil', () => {
    const f = speciesFilter('other');
    expect(f.$nin).toEqual(expect.arrayContaining(['cat', 'gato', 'dog', 'perro', 'reptile', 'tortuga']));
    expect(f.$nin).not.toContain('bird');
  });

  it('sin valor no filtra', () => {
    expect(speciesFilter('')).toBeUndefined();
  });
});
