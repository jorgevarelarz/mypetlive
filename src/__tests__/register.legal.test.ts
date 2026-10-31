import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

/**
 * La casilla «Acepto los términos y la política de privacidad» del registro
 * guarda la aceptación en el mismo alta (21-10-2026). Sin ella el alta sigue
 * funcionando (apps ya instaladas) y la aceptación queda pendiente.
 */

let app: any;
let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  const mod = await import('../app');
  app = mod.app || mod.default;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const password = 'Una-clave-larga-2026!';

describe('Registro con aceptación legal', () => {
  it('con acceptLegal guarda términos y privacidad vigentes, con rastro', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', email: 'ana-legal@example.com', password, acceptLegal: true })
      .expect(201);
    const status = await request(app)
      .get('/api/legal/status')
      .set('Authorization', `Bearer ${res.body.token}`)
      .expect(200);
    expect(status.body.terms.acceptedVersion).toBe(status.body.terms.latest.version);
    expect(status.body.privacy.acceptedVersion).toBe(status.body.privacy.latest.version);
    const { LegalAcceptance } = await import('../models/legalAcceptance.model');
    const rows = await LegalAcceptance.find({ userId: res.body.user._id }).lean();
    expect(rows.map((r: any) => r.slug).sort()).toEqual(['privacy', 'terms']);
  });

  it('sin acceptLegal el alta funciona y la aceptación queda pendiente', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bea', email: 'bea-legal@example.com', password })
      .expect(201);
    const status = await request(app)
      .get('/api/legal/status')
      .set('Authorization', `Bearer ${res.body.token}`)
      .expect(200);
    expect(status.body.terms.acceptedVersion).toBeFalsy();
  });
});
