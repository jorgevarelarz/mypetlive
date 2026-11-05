import { sessionNeedsRenewal } from '../auth';

const token = (iat: number) => `x.${btoa(JSON.stringify({ iat }))}.y`;
const ahora = Date.parse('2026-11-05T12:00:00Z');
const dias = (n: number) => Math.floor((ahora - n * 86400000) / 1000);

describe('sessionNeedsRenewal', () => {
  it('renueva un token de más de una semana', () => expect(sessionNeedsRenewal(token(dias(8)), ahora)).toBe(true));
  it('deja en paz un token reciente', () => expect(sessionNeedsRenewal(token(dias(2)), ahora)).toBe(false));
  it('no revienta con un token raro', () => {
    expect(sessionNeedsRenewal('raro', ahora)).toBe(false);
    expect(sessionNeedsRenewal(undefined, ahora)).toBe(false);
  });
});
