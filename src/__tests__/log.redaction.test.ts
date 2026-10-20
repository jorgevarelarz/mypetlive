import pino from 'pino';
import { Writable } from 'stream';
import { loggerOptions } from '../utils/logger';
import { maskEmail, maskIban, maskPhone, scrubPii } from '../utils/redact';

const captureLogger = () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const log = pino({ ...loggerOptions, level: 'info' }, stream);
  return { log, output: () => lines.join('') };
};

describe('enmascarado de datos personales en los logs', () => {
  it('enmascara correos, teléfonos e IBAN en texto libre', () => {
    expect(maskEmail('jorge.perez@gmail.com')).toBe('j***@gmail.com');
    expect(maskEmail(maskEmail('jorge.perez@gmail.com'))).toBe('j***@gmail.com');
    expect(maskPhone('+34 600 123 456')).toBe('***456');
    expect(maskIban('ES91 2100 0418 4502 0005 1332')).toBe('ES91****1332');
    expect(scrubPii('550 mailbox <ana@example.org> unavailable')).toBe('550 mailbox <a***@example.org> unavailable');
    expect(scrubPii('The To number +34600123456 is not valid')).toBe('The To number ***456 is not valid');
    // Importes, fechas e IDs de Stripe o Mongo no se tocan.
    const neutral = 'pi_3Abc123 por 1200 € el 2026-10-11, contrato 652f1c2e9b1e8a0012345678';
    expect(scrubPii(neutral)).toBe(neutral);
  });

  it('el envío de correo y de SMS no deja la dirección ni el teléfono completos', () => {
    const { log, output } = captureLogger();
    log.info({ type: 'email_sent', to: 'ana.garcia@example.org', subject: 'Hola' }, 'Email enviado');
    log.info({ type: 'sms_mock', to: '+34600123456' }, 'SMS no configurado');
    log.info({ user: { email: 'luis@example.org', phone: '+34 611 222 333' } }, 'perfil');
    const out = output();
    expect(out).not.toMatch(/ana\.garcia@/);
    expect(out).not.toMatch(/luis@/);
    expect(out).not.toMatch(/600123456|611 222 333/);
    expect(out).toContain('a***@example.org');
    expect(out).toContain('***456');
    expect(out).toContain('***333');
  });

  it('oculta secretos y limpia el mensaje y los errores', () => {
    const { log, output } = captureLogger();
    log.info({ password: 'hunter22', req: { headers: { authorization: 'Bearer abc.def' } } }, 'login');
    const err = Object.assign(new Error('E11000 duplicate key error dup key: { email: "eva@example.org" }'), {
      response: '550 5.1.1 <eva@example.org>: user unknown',
    });
    log.error({ err }, 'Error actualizando perfil de eva@example.org');
    const out = output();
    expect(out).not.toMatch(/hunter22|abc\.def/);
    expect(out).toContain('[oculto]');
    expect(out).not.toMatch(/eva@/);
    expect(out).toContain('e***@example.org');
    // El stack sigue saliendo para poder depurar.
    expect(out).toContain('log.redaction.test.ts');
  });
});
