import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { User } from '../models/user.model';

// La verificación criptográfica del ID token se prueba aparte (oidc.test.ts):
// aquí lo que interesa es el alta, la vinculación y qué pasa con la contraseña.
jest.mock('../utils/oidc', () => {
  const actual = jest.requireActual('../utils/oidc');
  return { ...actual, verifyIdToken: jest.fn() };
});
import { verifyIdToken } from '../utils/oidc';

const mockVerify = verifyIdToken as jest.MockedFunction<typeof verifyIdToken>;

let app: any;
let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.APP_ENV = 'production';
  process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';
  process.env.GOOGLE_CLIENT_ID = 'client-id-de-prueba.apps.googleusercontent.com';

  const mod = await import('../app');
  app = mod.app || mod.default;
});

afterEach(async () => {
  await User.deleteMany({});
  mockVerify.mockReset();
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
  delete process.env.APP_ENV;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.APPLE_CLIENT_ID;
});

const googleClaims = (over: Record<string, unknown> = {}) => ({
  sub: 'google-sub-1',
  email: 'Nueva@Gmail.com',
  email_verified: true,
  name: 'Nueva Adoptante',
  ...over,
});

describe('Login con Google/Apple', () => {
  it('da de alta un adoptante nuevo sin contraseña', async () => {
    mockVerify.mockResolvedValue(googleClaims() as any);

    const res = await request(app)
      .post('/api/auth/oauth/google')
      .send({ idToken: 'token-valido' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.role).toBe('tenant');
    expect(res.body.user.email).toBe('nueva@gmail.com');

    const saved = await User.findOne({ email: 'nueva@gmail.com' }).lean();
    expect(saved?.passwordHash).toBeUndefined();
    expect(saved?.authProviders).toEqual([{ provider: 'google', sub: 'google-sub-1' }]);
  });

  it('vincula el proveedor a una cuenta que ya existe con contraseña', async () => {
    await User.create({
      name: 'Laura',
      email: 'laura@example.com',
      passwordHash: await bcrypt.hash('una-clave-segura-2026', 10),
      role: 'tenant',
    });
    mockVerify.mockResolvedValue(googleClaims({ email: 'laura@example.com', sub: 'sub-laura' }) as any);

    const res = await request(app)
      .post('/api/auth/oauth/google')
      .send({ idToken: 'token-valido' });

    expect(res.status).toBe(200);
    const saved = await User.findOne({ email: 'laura@example.com' }).lean();
    expect(saved?.authProviders).toEqual([{ provider: 'google', sub: 'sub-laura' }]);
    // Sigue pudiendo entrar con su contraseña de siempre.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'laura@example.com', password: 'una-clave-segura-2026' });
    expect(login.status).toBe(200);
  });

  it('no duplica el proveedor al entrar dos veces', async () => {
    mockVerify.mockResolvedValue(googleClaims() as any);
    await request(app).post('/api/auth/oauth/google').send({ idToken: 'token-valido' });
    await request(app).post('/api/auth/oauth/google').send({ idToken: 'token-valido' });

    const saved = await User.findOne({ email: 'nueva@gmail.com' }).lean();
    expect(saved?.authProviders).toHaveLength(1);
  });

  it('rechaza un ID token que no verifica', async () => {
    mockVerify.mockRejectedValue(new Error('invalid signature'));

    const res = await request(app)
      .post('/api/auth/oauth/google')
      .send({ idToken: 'token-falso' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_id_token');
    expect(await User.countDocuments()).toBe(0);
  });

  it('rechaza un correo que el proveedor no da por verificado', async () => {
    mockVerify.mockResolvedValue(googleClaims({ email_verified: false }) as any);

    const res = await request(app)
      .post('/api/auth/oauth/google')
      .send({ idToken: 'token-valido' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('email_not_verified_by_provider');
  });

  it('responde 503 si el proveedor no está configurado', async () => {
    mockVerify.mockResolvedValue(googleClaims() as any);

    const res = await request(app)
      .post('/api/auth/oauth/apple')
      .send({ idToken: 'token-valido' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('provider_not_configured');
  });

  it('rechaza proveedores desconocidos', async () => {
    const res = await request(app)
      .post('/api/auth/oauth/facebook')
      .send({ idToken: 'token-valido' });

    expect(res.status).toBe(400);
  });

  it('explica que hay que usar el botón social al intentar entrar con contraseña', async () => {
    mockVerify.mockResolvedValue(googleClaims() as any);
    await request(app).post('/api/auth/oauth/google').send({ idToken: 'token-valido' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nueva@gmail.com', password: 'lo-que-sea-largo-1234' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('use_social_login');
    expect(res.body.message).toMatch(/Google/);
  });

  it('usa el nombre que manda el front cuando el token no lo trae (caso Apple)', async () => {
    mockVerify.mockResolvedValue(googleClaims({ name: undefined }) as any);

    await request(app)
      .post('/api/auth/oauth/google')
      .send({ idToken: 'token-valido', name: 'Fátima Caramés' });

    const saved = await User.findOne({ email: 'nueva@gmail.com' }).lean();
    expect(saved?.name).toBe('Fátima Caramés');
  });

  it('cae al usuario del correo si no hay nombre por ningún lado', async () => {
    mockVerify.mockResolvedValue(googleClaims({ name: undefined }) as any);

    await request(app).post('/api/auth/oauth/google').send({ idToken: 'token-valido' });

    const saved = await User.findOne({ email: 'nueva@gmail.com' }).lean();
    expect(saved?.name).toBe('nueva');
  });
});
