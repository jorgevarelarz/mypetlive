import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

/**
 * Regresión de la auditoría del 31-07-2026. Dos fallos que dejaron la web
 * inservible para un visitante anónimo y sin consentimiento legal válido:
 *
 *  - `app.use('/api', authenticate, pushRoutes)` colaba el middleware de
 *    autenticación en TODO /api, así que protectoras, vets y cupones daban 401.
 *  - `/legal/:slug` se declaraba antes que `/legal/status`, y la ruta dinámica
 *    capturaba "status" como slug devolviendo 400.
 */

let app: any;
let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_URL = 'https://mypetlive.es';
  const mod = await import('../app');
  app = mod.app || mod.default;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

// En NODE_ENV=test `authenticate` inyecta un usuario falso cuando NO hay
// token, así que pedir sin cabecera no distingue una ruta pública de una
// protegida. Con un token ILEGIBLE no hay excepción de entorno que valga:
// jwt.verify revienta y `authenticate` responde 401, mientras que
// `optionalAuthenticate` lo ignora y sigue como anónimo. Ese es el discriminante.
const BAD_TOKEN = 'Bearer no.es.un.jwt';

describe('El directorio público responde sin iniciar sesión', () => {
  // Si alguien vuelve a montar un middleware de auth con prefijo '/api',
  // estos cuatro caen a la vez.
  it.each([
    ['/api/protectoras'],
    ['/api/vets'],
    ['/api/coupons'],
    ['/api/marketplace/products'],
  ])('GET %s no pasa por authenticate', async (path) => {
    const res = await request(app).get(path).set('Authorization', BAD_TOKEN);
    expect(res.status).not.toBe(401);
    expect(res.status).toBeLessThan(500);
  });
});

describe('Las rutas de push siguen protegidas', () => {
  it('POST /api/push/subscribe sí pasa por authenticate', async () => {
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', BAD_TOKEN)
      .send({});
    expect(res.status).toBe(401);
  });
});

describe('Rutas legales', () => {
  it('GET /api/legal/status no confunde "status" con un slug', async () => {
    const res = await request(app).get('/api/legal/status');
    // El bug daba 400: la ruta dinámica capturaba "status" y isIn(legalSlugs)
    // lo rechazaba. Ahora llega a su handler y devuelve el estado legal.
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('terms');
    expect(res.body).toHaveProperty('privacy');
    expect(res.body.terms.latest.version).toBe('v2');
  });

  it.each([['terms'], ['privacy'], ['legal-notice'], ['cookies']])(
    'GET /api/legal/%s devuelve el documento',
    async (slug) => {
      const res = await request(app).get(`/api/legal/${slug}`);
      expect(res.status).toBe(200);
      expect(res.body.slug).toBe(slug);
      expect(String(res.body.content).length).toBeGreaterThan(200);
    },
  );

  it('un slug inventado sigue dando 400', async () => {
    const res = await request(app).get('/api/legal/no-existe');
    expect(res.status).toBe(400);
  });
});
