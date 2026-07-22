import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

// F0 seguridad: producción corre con NODE_ENV=development (mocks) y ALLOW_UNVERIFIED=true,
// así que los bypasses de verificación deben cerrarse con APP_ENV=production (isProduction),
// no con NODE_ENV. Sin este candado, /dev/verify permitía a cualquier cuenta autoverificarse.

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

afterEach(() => {
  delete process.env.APP_ENV;
});

const userId = new mongoose.Types.ObjectId().toHexString();
const userH = { 'x-user-id': userId, 'x-user-role': 'tenant', 'x-user-verified': 'false' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([{ _id: userId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' }]);
});

describe('POST /api/verification/dev/verify', () => {
  it('queda bloqueado cuando APP_ENV=production aunque ALLOW_UNVERIFIED siga a true', async () => {
    process.env.APP_ENV = 'production';
    await request(app).post('/api/verification/dev/verify').set(userH).expect(403);
  });

  it('sigue disponible en desarrollo local (sin APP_ENV)', async () => {
    const res = await request(app).post('/api/verification/dev/verify').set(userH).expect(200);
    expect(res.body.status).toBe('verified');
  });
});

describe('requireVerified con APP_ENV=production', () => {
  const { requireVerified } = require('../middleware/requireVerified');

  function run(user: any) {
    return new Promise<{ status?: number; nexted: boolean }>(resolve => {
      const req: any = { user, headers: {} };
      const res: any = {
        status(code: number) {
          return { json: () => resolve({ status: code, nexted: false }) };
        },
      };
      requireVerified(req, res, () => resolve({ nexted: true }));
    });
  }

  it('bloquea a un usuario sin verificar en producción (sin bypass ALLOW_UNVERIFIED)', async () => {
    process.env.APP_ENV = 'production';
    const out = await run({ _id: userId, role: 'tenant', isVerified: false });
    expect(out).toEqual({ status: 403, nexted: false });
  });

  it('mantiene el bypass fuera de producción', async () => {
    const out = await run({ _id: userId, role: 'tenant', isVerified: false });
    expect(out).toEqual({ nexted: true });
  });

  it('deja pasar a verificados y admins también en producción', async () => {
    process.env.APP_ENV = 'production';
    expect(await run({ _id: userId, role: 'tenant', isVerified: true })).toEqual({ nexted: true });
    expect(await run({ _id: userId, role: 'admin', isVerified: false })).toEqual({ nexted: true });
  });
});
