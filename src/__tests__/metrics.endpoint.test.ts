import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { Writable } from 'stream';
import { loggerOptions } from '../utils/logger';
import { metricsMiddleware, sanitizeUrl } from '../metrics';
import { app } from '../app';

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

describe('log HTTP sin el token de invitado', () => {
  it('no deja el token de invitado en el log HTTP', async () => {
    const { log, output } = captureLogger();
    const mini = express();
    mini.use((_req, res, next) => {
      res.locals.logger = log;
      next();
    });
    mini.use(metricsMiddleware);
    mini.get('/pedido/:id', (_req, res) => {
      res.status(200).json({ ok: true });
    });

    await request(mini).get('/pedido/1?ok=1&token=abc').expect(200);
    // 'finish' puede emitirse justo después de que supertest reciba la respuesta.
    await new Promise((r) => setImmediate(r));

    const out = output();
    expect(out).toContain('"type":"http"');
    expect(out).not.toContain('abc');
    expect(out).toContain('oculto');
    expect(out).toContain('ok=1');
  });

  it('sanitizeUrl deja intactas las URLs sin token', () => {
    expect(sanitizeUrl('/health')).toBe('/health');
    expect(sanitizeUrl('/x?ok=1')).toBe('/x?ok=1');
    expect(sanitizeUrl('/x?token=')).not.toMatch(/token=$/);
    expect(sanitizeUrl('/x?token=')).toMatch(/oculto/);
    const tapada = sanitizeUrl('/x?ok=1&token=abc&cancelado=1');
    expect(tapada).toMatch(/^\/x\?ok=1&token=[^&]*oculto[^&]*&cancelado=1$/);
    expect(tapada).not.toContain('abc');
    expect(sanitizeUrl('/x?token=a&token=b')).not.toMatch(/token=(a|b)(&|$)/);
  });
});

describe('/metrics protegido con METRICS_TOKEN', () => {
  const original = process.env.METRICS_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = original;
  });

  it('/metrics sin METRICS_TOKEN configurado devuelve 404', async () => {
    delete process.env.METRICS_TOKEN;
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(404);
    expect(res.text || '').not.toContain('http_requests_total');

    const conCabecera = await request(app).get('/metrics').set('Authorization', 'Bearer cualquiera');
    expect(conCabecera.status).toBe(404);
    expect(conCabecera.text || '').not.toContain('http_requests_total');

    process.env.METRICS_TOKEN = '';
    const vacio = await request(app).get('/metrics').set('Authorization', 'Bearer ');
    expect(vacio.status).toBe(404);
    expect(vacio.text || '').not.toContain('http_requests_total');
  });

  it('/metrics con token configurado pero sin credencial o con credencial errónea devuelve 404', async () => {
    process.env.METRICS_TOKEN = 'token-de-prueba-metricas';
    const intentos = [
      request(app).get('/metrics'),
      request(app).get('/metrics').set('Authorization', 'Bearer otro'),
      request(app)
        .get('/metrics')
        .set('Authorization', `Basic ${Buffer.from('u:token-de-prueba-metricas').toString('base64')}`),
      request(app).get('/metrics').set('Authorization', 'Basic token-de-prueba-metricas'),
    ];
    for (const intento of intentos) {
      const res = await intento;
      expect(res.status).toBe(404);
      expect(res.text || '').not.toContain('http_requests_total');
    }
  });

  it('/metrics con la credencial correcta devuelve las métricas', async () => {
    process.env.METRICS_TOKEN = 'token-de-prueba-metricas';
    const res = await request(app).get('/metrics').set('Authorization', 'Bearer token-de-prueba-metricas');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('http_requests_total');
  });
});
