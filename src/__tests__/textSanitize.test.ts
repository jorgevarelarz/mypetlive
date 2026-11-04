import { cleanText, textSanitize } from '../middleware/textSanitize';

describe('filtro de textos', () => {
  it.each([
    ['Toby<script>alert(1)</script>', 'Toby'],
    ['<img src=x onerror=alert(1)>Luna', 'Luna'],
    ['<scr<script>ipt>alert(1)</scr</script>ipt>', ''],
    ['hola <b>mundo</b>', 'hola mundo'],
    ['Luna<img src=x onerror=alert(1)', 'Luna'],
    ['javascript:alert(1)', 'alert(1)'],
    ['  JaVaScRiPt:alert(1)', 'alert(1)'],
  ])('limpia %s', (entrada, salida) => {
    expect(cleanText(entrada)).toBe(salida);
  });

  it.each(['Te quiero <3', '5 < 6 y 7 > 2', 'Pienso 2 kg (80 g/día)', "D'Artacán & Cía"])(
    'respeta %s',
    texto => {
      expect(cleanText(texto)).toBe(texto);
    },
  );

  it('limpia textos anidados y no toca contraseñas ni tokens', () => {
    const req: any = {
      body: { name: '<b>Toby</b>', notes: [{ text: '<script>x</script>ok' }], password: 'a<b>c', currentPassword: '<i>x</i>', token: '<b>t' },
      query: { q: '<i>luna</i>' },
    };
    textSanitize(req, {} as any, () => undefined);
    expect(req.body).toEqual({ name: 'Toby', notes: [{ text: 'ok' }], password: 'a<b>c', currentPassword: '<i>x</i>', token: '<b>t' });
    expect(req.query.q).toBe('luna');
  });
});
