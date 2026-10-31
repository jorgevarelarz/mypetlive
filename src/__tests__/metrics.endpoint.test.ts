import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { Writable } from 'stream';
import logger, { loggerOptions } from '../utils/logger';
import { requestId } from '../middleware/requestId';
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
    // El middleware real requestId crea el logger hijo (con la url en sus bindings)
    // a partir del logger base: lo redirigimos al logger de captura.
    const childSpy = jest
      .spyOn(logger, 'child')
      .mockImplementation(((bindings: any, opts?: any) => log.child(bindings, opts)) as any);
    const mini = express();
    mini.use(requestId);
    mini.use(metricsMiddleware);
    mini.get('/pedido/:id', (_req, res) => {
      res.status(200).json({ ok: true });
    });

    let childCalls = 0;
    try {
      await request(mini).get('/pedido/1?ok=1&token=abc123secreto').expect(200);
      // 'finish' puede emitirse justo después de que supertest reciba la respuesta.
      await new Promise((r) => setImmediate(r));
    } finally {
      childCalls = childSpy.mock.calls.length;
      childSpy.mockRestore();
    }

    const out = output();
    expect(childCalls).toBeGreaterThan(0);
    expect(out).toContain('"type":"http"');
    expect(out).not.toContain('abc123secreto');
    expect(out).toContain('oculto');
    expect(out).toContain('ok=1');
  });

  it('no deja en el log las variantes de token con corchetes (que Express lee como req.query.token)', async () => {
    const { log, output } = captureLogger();
    const childSpy = jest
      .spyOn(logger, 'child')
      .mockImplementation(((bindings: any, opts?: any) => log.child(bindings, opts)) as any);
    const mini = express();
    mini.use(requestId);
    mini.use(metricsMiddleware);
    const vistos: unknown[] = [];
    mini.get('/pedido/:id', (req, res) => {
      vistos.push(req.query.token);
      res.status(200).json({ ok: true });
    });

    const urls = [
      '/pedido/1?ok=1&token[]=secretoA',
      '/pedido/1?ok=1&token[0]=secretoB',
      '/pedido/1?ok=1&token%5B%5D=secretoC',
      '/pedido/1?ok=1&token%5b0%5d=secretoD',
      '/pedido/1?ok=1&%74oken=secretoE',
      '/pedido/1?ok=1&[token]=secretoF',
      '/pedido/1?ok=1&%5Btoken%5D=secretoG',
    ];
    try {
      for (const url of urls) {
        await request(mini).get(url).expect(200);
      }
      await new Promise((r) => setImmediate(r));
    } finally {
      childSpy.mockRestore();
    }

    // Express sí las interpreta como el token del pedido.
    expect(vistos.map((v) => String(v))).toEqual(['secretoA', 'secretoB', 'secretoC', 'secretoD', 'secretoE', 'secretoF', 'secretoG']);

    const out = output();
    expect(out).toContain('"type":"http"');
    expect(out).not.toMatch(/secreto[A-G]/);
    expect(out).toContain('oculto');
    expect(out).toContain('ok=1');
  });

  it('sanitizeUrl oculta token con corchetes y cualquier clave que contenga token', () => {
    expect(sanitizeUrl('/x?token[]=s1&ok=1')).not.toContain('s1');
    expect(sanitizeUrl('/x?token[0]=s2&token[1]=s3')).not.toMatch(/s2|s3/);
    expect(sanitizeUrl('/x?token%5B%5D=s4')).not.toContain('s4');
    expect(sanitizeUrl('/x?token[a][b]=s5')).not.toContain('s5');
    // Ocultar de más es aceptable: cualquier clave con «token» se tapa.
    expect(sanitizeUrl('/x?tokens=1&ok=2')).toBe('/x?tokens=[oculto]&ok=2');
  });

  it('sanitizeUrl tapa toda clave que Express entregue como req.query.token', () => {
    // El parser «extended» de Express 4 es qs.parse(str, { allowPrototypes: true }).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const qs = require('qs');
    const claves = [
      'token', 'token[]', 'token[0]', 'token[a][b]', '[token]', '%5Btoken%5D', 'token%5B%5D',
      '%74oken', '%74%6F%6B%65%6E', '[token][x]', 'token]', '%5Btoken%5D%5B%5D', 'Token', 'TOKEN',
    ];
    let interpretadas = 0;
    for (const clave of claves) {
      const query = `ok=1&${clave}=SECRETO123&b=2`;
      const parsed = qs.parse(query, { allowPrototypes: true });
      const limpia = sanitizeUrl(`/pedido/1?${query}`);
      if (parsed.token !== undefined) {
        interpretadas += 1;
        expect(limpia).not.toContain('SECRETO123');
      }
      // Los otros parámetros quedan exactamente igual.
      expect(limpia.startsWith('/pedido/1?ok=1&')).toBe(true);
      expect(limpia.endsWith('&b=2')).toBe(true);
    }
    // Que la prueba no pase en vacío: qs entrega la mayoría como token.
    expect(interpretadas).toBeGreaterThanOrEqual(10);
  });

  it('sanitizeUrl conserva byte a byte los demás parámetros', () => {
    expect(sanitizeUrl('/x?q=a%20b+c&token=s&z=%C3%B1')).toBe('/x?q=a%20b+c&token=[oculto]&z=%C3%B1');
    expect(sanitizeUrl('/x?%E0%A4%A=1&token=s')).toBe('/x?%E0%A4%A=1&token=[oculto]');
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
