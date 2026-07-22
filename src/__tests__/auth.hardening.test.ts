import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { User } from '../models/user.model';

let app: any;
let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.APP_ENV = 'production';
  process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';
  process.env.CORS_ORIGIN = 'https://mypetlive.es';

  const mod = await import('../app');
  app = mod.app || mod.default;
});

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
  delete process.env.APP_ENV;
});

describe('Auth hardening', () => {
  const password = 'una-clave-segura-2026';

  it.each(['protectora', 'landlord', 'vet', 'store', 'pro', 'admin'])(
    'rejects public self-registration for the protected role %s',
    async role => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Cuenta profesional', email: `${role}@example.com`, password, role });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('professional_onboarding_required');
      expect(await User.exists({ email: `${role}@example.com` })).toBeNull();
    },
  );

  it('rejects unknown roles instead of silently granting a default role', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Unknown', email: 'unknown@example.com', password, role: 'superuser' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_role');
    expect(await User.exists({ email: 'unknown@example.com' })).toBeNull();
  });

  it.each([undefined, 'tenant', 'adoptante'])(
    'creates only a tenant from the public registration role %s',
    async role => {
      const email = `tenant-${role || 'missing'}@example.com`;
      const payload: Record<string, string> = { name: 'Adoptante', email, password };
      if (role) payload.role = role;

      const res = await request(app).post('/api/auth/register').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('tenant');
      expect((await User.findOne({ email }))?.role).toBe('tenant');
    },
  );

  it('requires new and reset passwords to have at least 12 characters', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Weak', email: 'weak@example.com', password: 'short123' });
    const resetRes = await request(app)
      .post('/api/auth/reset')
      .send({ token: 'not-used', password: 'short123' });

    expect(registerRes.status).toBe(400);
    expect(registerRes.body.message).toBe('validation_error');
    expect(resetRes.status).toBe(400);
    expect(resetRes.body.message).toBe('validation_error');
  });

  it('rejects passwords longer than the 72-byte bcrypt limit', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Long', email: 'long@example.com', password: 'á'.repeat(37) });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('validation_error');
  });

  it('keeps existing accounts with shorter passwords able to log in', async () => {
    await User.create({
      name: 'Cuenta existente',
      email: 'existing@example.com',
      passwordHash: await bcrypt.hash('password', 10),
      role: 'tenant',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'existing@example.com', password: 'password' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('enables production security headers when APP_ENV is production', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});
