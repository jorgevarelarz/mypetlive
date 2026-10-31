import * as crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import logger from './utils/logger';
import getRequestLogger from './utils/requestLogger';

const metricsRegistry: Registry = new Registry();

if (!(globalThis as any).__rentalMetricsInitialized) {
  collectDefaultMetrics({ register: metricsRegistry });
  (globalThis as any).__rentalMetricsInitialized = true;
}

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Número total de peticiones HTTP',
  labelNames: ['method', 'status'] as const,
  registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de las peticiones HTTP en segundos',
  labelNames: ['method', 'status'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [metricsRegistry],
});

/**
 * Cualquier parámetro cuyo nombre contenga `token` (sin distinguir mayúsculas),
 * mirado tanto en bruto como descodificado. El parser de query de Express (qs)
 * entrega como `req.query.token` muchas formas: `token`, `token[]`, `token[0]`,
 * `[token]`, `%5Btoken%5D`, `%74oken`… Enumerarlas una a una siempre deja
 * alguna fuera; todas ellas contienen `token` una vez descodificadas, así que
 * se oculta ese superconjunto. Ocultar de más en un log no rompe nada.
 */
function isTokenKey(rawKey: string): boolean {
  if (/token/i.test(rawKey)) return true;
  try {
    return /token/i.test(decodeURIComponent(rawKey.replace(/\+/g, ' ')));
  } catch {
    return false; // qs, si no puede descodificar, usa la clave en bruto: ya mirada arriba
  }
}

/**
 * Sustituye el valor de los parámetros de tipo `token` de la query (credencial
 * del pedido de invitado) por `[oculto]`. El resto de la URL queda tal cual,
 * byte a byte: se trocea por `&` (el separador de qs) y solo se tocan esos pares.
 */
export function sanitizeUrl(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const path = url.slice(0, q);
  let found = false;
  const parts = url.slice(q + 1).split('&').map(part => {
    const eq = part.indexOf('=');
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    if (!isTokenKey(rawKey)) return part;
    found = true;
    return `${rawKey}=[oculto]`;
  });
  return found ? `${path}?${parts.join('&')}` : url;
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const method = (req.method || 'GET').toUpperCase();
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const status = res.statusCode;
    httpRequestsTotal.inc({ method, status: String(status) });

    const diffNs = process.hrtime.bigint() - started;
    const durationSeconds = Number(diffNs) / 1e9;
    httpRequestDurationSeconds.observe({ method, status: String(status) }, durationSeconds);

    const requestLogger = getRequestLogger(req, res) ?? logger;
    const requestId = res.locals.requestId;
    requestLogger.info({
      type: 'http',
      requestId,
      method,
      url: sanitizeUrl(req.originalUrl),
      status,
      responseTimeMs: durationSeconds * 1000,
    });
  });

  next();
}

function hasValidMetricsToken(req: Request): boolean {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return false;
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length) return false;
  return crypto.timingSafeEqual(given, wanted);
}

export async function metricsHandler(req: Request, res: Response) {
  // 404 tanto si no está configurado como si la credencial falta o no coincide:
  // así no se revela que el endpoint existe.
  if (!hasValidMetricsToken(req)) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
}
