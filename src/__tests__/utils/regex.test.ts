import { escapeRegex } from '../../utils/regex';

describe('escapeRegex', () => {
  it('deja intacto un texto normal', () => {
    expect(escapeRegex('ana@test.com')).toBe('ana@test\\.com');
    expect(escapeRegex('Lugo')).toBe('Lugo');
  });

  it('escapa los caracteres que rompen la consulta', () => {
    // Un "(" suelto hace que Mongo rechace la expresión y la petición acabe en 500.
    expect(new RegExp(escapeRegex('('))).toBeInstanceOf(RegExp);
    expect(() => new RegExp('(')).toThrow();
  });

  it('un paréntesis en la ciudad sigue casando consigo mismo', () => {
    const city = 'A Coruña (centro)';
    expect(new RegExp(escapeRegex(city), 'i').test(city)).toBe(true);
  });

  it('un patrón patológico deja de ser un patrón', () => {
    const evil = '(a+)+$';
    // Escapado ya no es un cuantificador anidado: solo casa el literal.
    expect(new RegExp(escapeRegex(evil)).test(evil)).toBe(true);
    expect(new RegExp(escapeRegex(evil)).test('aaaaaaaaaaaaaaaaaaaa')).toBe(false);
  });
});
