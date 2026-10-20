import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { User } from '../models/user.model';
import { createHash } from 'crypto';

const hashResetToken = (t: string) => createHash('sha256').update(t).digest('hex');

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

  // Regresión del 29 sep 2026: el móvil puso la inicial en mayúscula, el login
  // decía "usuario o contraseña incorrectos" y el reseteo respondía ok sin enviar nada.
  it('matches the email regardless of case in login and reset request', async () => {
    await User.create({
      name: 'Marina',
      email: 'marina@example.com',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'tenant',
    });

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'Marina@Example.com', password })
      .expect(200);

    await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'Marina@example.com' })
      .expect(200);
    // La respuesta sale antes de procesar (sin enumeración por tiempo): esperar al token.
    let stored: any = null;
    for (let i = 0; i < 50 && !stored?.resetToken; i++) {
      await new Promise(r => setTimeout(r, 50));
      stored = await User.findOne({ email: 'marina@example.com' }).select('+resetToken');
    }
    expect(stored?.resetToken).toMatch(/^[0-9a-f]{64}$/); // solo el hash, nunca el token
  });

  // Regresión de la auditoría del 5 sep 2026 (hallazgo alta #4): un JWT
  // seguía aceptándose después de restablecer la contraseña, porque
  // `authenticate` solo comprobaba la firma y la caducidad del token, nunca
  // si la cuenta había cambiado desde que se emitió.
  it('invalidates tokens issued before a password reset', async () => {
    const user = await User.create({
      name: 'Con sesión abierta',
      email: 'sesion@example.com',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'tenant',
    });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password })
      .expect(200);
    const oldToken = login.body.token as string;

    await request(app).get('/api/animals/mine').set('Authorization', `Bearer ${oldToken}`).expect(200);

    await User.updateOne(
      { _id: user._id },
      { resetToken: hashResetToken('test-reset-token'), resetTokenExp: new Date(Date.now() + 60_000) },
    );
    await request(app)
      .post('/api/auth/reset')
      .send({ token: 'test-reset-token', password: 'una-clave-nueva-2026' })
      .expect(200);

    await request(app).get('/api/animals/mine').set('Authorization', `Bearer ${oldToken}`).expect(401);

    const freshLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'una-clave-nueva-2026' })
      .expect(200);
    await request(app)
      .get('/api/animals/mine')
      .set('Authorization', `Bearer ${freshLogin.body.token}`)
      .expect(200);
  });

  it('enables production security headers when APP_ENV is production', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  // RentalApp 1231d5c: el rol se leía del JWT (7 días). Si el admin degradaba una
  // cuenta, seguía con los permisos del token hasta que caducaba.
  it('aplica un cambio de rol en la siguiente petición, sin esperar a que caduque el token', async () => {
    const user = await User.create({
      name: 'Protectora degradada',
      email: 'degradada@example.com',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'landlord',
    });
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password }).expect(200);
    const auth = { Authorization: `Bearer ${login.body.token}` };
    const animal = { name: 'Toby', species: 'dog', age: '2 años' };

    const ok = await request(app).post('/api/animals').set(auth).send(animal);
    expect(ok.status).not.toBe(403);

    await User.updateOne({ _id: user._id }, { role: 'tenant' });
    await request(app).post('/api/animals').set(auth).send(animal).expect(403);
  });
});
