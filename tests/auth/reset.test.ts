import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import { startMongoMemoryServer } from '../../src/__tests__/utils/mongoMemoryServer';
import { User } from '../../src/models/user.model';

let app: any;
let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  const mod = await import('../../src/app');
  app = mod.app || mod.default;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe('Password reset flow', () => {
  it('request-reset devuelve 200 aunque el email no exista', async () => {
    const res = await request(app).post('/api/auth/request-reset').send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('genera token y expiración para un usuario existente', async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    const user = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      passwordHash,
      role: 'tenant',
    });

    const res = await request(app).post('/api/auth/request-reset').send({ email: user.email });
    expect(res.status).toBe(200);

    // resetToken/resetTokenExp son select:false (no viajan por defecto): hay que
    // pedirlos explícitamente para comprobar que se persistieron.
    const updated = await User.findById(user._id).select('+resetToken +resetTokenExp');
    expect(updated?.resetToken).toBeDefined();
    expect(updated?.resetTokenExp).toBeInstanceOf(Date);
    expect(updated!.resetTokenExp!.getTime()).toBeGreaterThan(Date.now());
  });

  it('permite cambiar la contraseña con un token válido', async () => {
    const passwordHash = await bcrypt.hash('oldpassword', 10);
    const user = await User.create({
      name: 'Reset User',
      email: 'reset@example.com',
      passwordHash,
      role: 'tenant',
    });
    user.resetToken = 'validtoken';
    user.resetTokenExp = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const res = await request(app)
      .post('/api/auth/reset')
      .send({ token: 'validtoken', password: 'newpassword' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const updated = await User.findById(user._id);
    expect(updated?.resetToken).toBeFalsy();
    expect(updated?.resetTokenExp).toBeFalsy();
    expect(await bcrypt.compare('newpassword', updated!.passwordHash)).toBe(true);
  });

  it('rechaza tokens inválidos o expirados', async () => {
    const passwordHash = await bcrypt.hash('anotherpassword', 10);
    const user = await User.create({
      name: 'Expired User',
      email: 'expired@example.com',
      passwordHash,
      role: 'tenant',
    });
    user.resetToken = 'expiredtoken';
    user.resetTokenExp = new Date(Date.now() - 1000);
    await user.save();

    const res = await request(app)
      .post('/api/auth/reset')
      .send({ token: 'expiredtoken', password: 'newpass' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'token_invalid',
      message: 'Token inválido o expirado',
    });
  });
});
