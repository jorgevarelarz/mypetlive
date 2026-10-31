import { readUrlToken, rememberOrderToken, storedOrderToken } from '../urlToken';

describe('readUrlToken', () => {
  it('lee el token del fragmento', () => {
    expect(readUrlToken('#token=abc', '')).toBe('abc');
    expect(readUrlToken('#token=a%2Bb', '?ok=1')).toBe('a+b');
  });

  it('acepta ?token= de los correos ya enviados', () => {
    expect(readUrlToken('', '?ok=1&token=viejo')).toBe('viejo');
  });

  it('prefiere el fragmento y devuelve vacío si no hay token', () => {
    expect(readUrlToken('#token=nuevo', '?token=viejo')).toBe('nuevo');
    expect(readUrlToken('#impacto', '?ok=1')).toBe('');
  });
});

describe('token del pedido guardado', () => {
  it('se guarda por pedido y se recupera', () => {
    rememberOrderToken('o1', 'tok1');
    expect(storedOrderToken('o1')).toBe('tok1');
    expect(storedOrderToken('o2')).toBe('');
    rememberOrderToken('o3', undefined);
    expect(storedOrderToken('o3')).toBe('');
  });
});
