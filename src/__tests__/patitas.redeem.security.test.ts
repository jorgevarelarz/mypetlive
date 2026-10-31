import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let controller: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  process.env.PATITA_VALUE_EUR = '0.10';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  controller = await import('../controllers/patitas.controller');
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
});

const newId = () => new mongoose.Types.ObjectId().toHexString();
const headers = (id: string, role: string) => ({ 'x-user-id': id, 'x-user-role': role, 'x-user-verified': 'true' });

async function createShelter(patitas: number) {
  const id = newId();
  await User.create({ _id: id, name: 'Protectora Lugo', email: `s${id}@test.com`, passwordHash: 'x', role: 'landlord', patitas });
  return id;
}

async function createStore() {
  const id = newId();
  await User.create({ _id: id, name: 'Tienda', email: `t${id}@test.com`, passwordHash: 'x', role: 'store' });
  return id;
}

async function walletCode(shelterId: string): Promise<string> {
  const res = await request(app).get('/api/patitas/wallet/token').set(headers(shelterId, 'landlord')).expect(200);
  return res.body.code;
}

async function balance(id: string): Promise<number> {
  const u = await User.findById(id).select('patitas').lean();
  return (u?.patitas as number) || 0;
}

// Código con formato válido que no se ha emitido (la probabilidad de colisión es despreciable).
const UNKNOWN = 'ZZZZZZZZZZ';

describe('Seguridad del canje de Patitas por código de wallet', () => {
  it('el código de wallet tiene 10 caracteres del alfabeto sin ambiguos', async () => {
    const shelterId = await createShelter(10);
    const code = await walletCode(shelterId);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
  });

  it('el código de cliente sigue teniendo 6 caracteres', async () => {
    const tenantId = newId();
    await User.create({ _id: tenantId, name: 'Ana', email: `a${tenantId}@test.com`, passwordHash: 'x', role: 'tenant' });
    const res = await request(app).get('/api/patitas/my-code').set(headers(tenantId, 'tenant')).expect(200);
    expect(res.body.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('un código de wallet no sirve para un segundo canje', async () => {
    const shelterId = await createShelter(100);
    const storeId = await createStore();
    const code = await walletCode(shelterId);

    await request(app).post('/api/patitas/redeem/confirm').set(headers(storeId, 'store')).send({ code, amount: 20 }).expect(200);
    const second = await request(app).post('/api/patitas/redeem/confirm').set(headers(storeId, 'store')).send({ code, amount: 20 });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe('invalid_wallet');
    expect(await balance(shelterId)).toBe(80);
  });

  it('un canje fallido por saldo no consume el código', async () => {
    const shelterId = await createShelter(30);
    const storeId = await createStore();
    const code = await walletCode(shelterId);

    const failed = await request(app).post('/api/patitas/redeem/confirm').set(headers(storeId, 'store')).send({ code, amount: 500 });
    expect(failed.status).toBe(400);
    expect(failed.body.error).toBe('insufficient_patitas');

    await request(app).post('/api/patitas/redeem/confirm').set(headers(storeId, 'store')).send({ code, amount: 10 }).expect(200);
    expect(await balance(shelterId)).toBe(20);
  });

  it('preview no consume el código', async () => {
    const shelterId = await createShelter(50);
    const storeId = await createStore();
    const code = await walletCode(shelterId);
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/patitas/redeem/preview').set(headers(storeId, 'store')).send({ code, amount: 10 }).expect(200);
    }
    await request(app).post('/api/patitas/redeem/confirm').set(headers(storeId, 'store')).send({ code, amount: 10 }).expect(200);
  });

  it('tras 10 intentos fallidos el partner recibe 429 en preview, confirm e identify', async () => {
    const shelterId = await createShelter(50);
    const storeId = await createStore();
    const code = await walletCode(shelterId);
    const h = headers(storeId, 'store');

    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/patitas/redeem/preview').set(h).send({ code: UNKNOWN }).expect(400);
    }
    const blocked = await request(app).post('/api/patitas/redeem/preview').set(h).send({ code });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('too_many_attempts');

    const confirm = await request(app).post('/api/patitas/redeem/confirm').set(h).send({ code, amount: 10 });
    expect(confirm.status).toBe(429);
    expect(confirm.body.code).toBe('too_many_attempts');

    const identify = await request(app).post('/api/patitas/identify').set(h).send({ code: 'ABC234' });
    expect(identify.status).toBe(429);
    expect(identify.body.code).toBe('too_many_attempts');

    expect(await balance(shelterId)).toBe(50);
  });

  it('el bloqueo de un partner no afecta a otro', async () => {
    const shelterId = await createShelter(50);
    const attacker = await createStore();
    const honest = await createStore();
    const code = await walletCode(shelterId);

    for (let i = 0; i < 11; i++) {
      await request(app).post('/api/patitas/redeem/preview').set(headers(attacker, 'store')).send({ code: UNKNOWN });
    }
    await request(app).post('/api/patitas/redeem/preview').set(headers(attacker, 'store')).send({ code }).expect(429);

    await request(app).post('/api/patitas/redeem/preview').set(headers(honest, 'store')).send({ code, amount: 10 }).expect(200);
    await request(app).post('/api/patitas/redeem/confirm').set(headers(honest, 'store')).send({ code, amount: 10 }).expect(200);
    expect(await balance(shelterId)).toBe(40);
  });

  it('las respuestas correctas no cuentan para el límite', async () => {
    const shelterId = await createShelter(50);
    const storeId = await createStore();
    const code = await walletCode(shelterId);
    for (let i = 0; i < 12; i++) {
      const res = await request(app).post('/api/patitas/redeem/preview').set(headers(storeId, 'store')).send({ code, amount: 5 });
      expect(res.status).toBe(200);
    }
  });

  it('purgeExpiredPatitasStores borra lo caducado y conserva lo vigente', () => {
    const { walletCodeStore, visitStore, purgeExpiredPatitasStores } = controller;
    const now = Date.now();
    walletCodeStore.set('CADUCADO22', { shelterId: 'a', expiresAt: now - 1 });
    walletCodeStore.set('VIGENTE222', { shelterId: 'b', expiresAt: now + 60_000 });
    visitStore.set('u1:p1', now - 13 * 60 * 60 * 1000);
    visitStore.set('u2:p2', now - 60 * 60 * 1000);

    purgeExpiredPatitasStores(now);

    expect(walletCodeStore.has('CADUCADO22')).toBe(false);
    expect(walletCodeStore.has('VIGENTE222')).toBe(true);
    expect(visitStore.has('u1:p1')).toBe(false);
    expect(visitStore.has('u2:p2')).toBe(true);

    // Con un `now` futuro, todo lo de antes ha caducado.
    purgeExpiredPatitasStores(now + 13 * 60 * 60 * 1000);
    expect(walletCodeStore.has('VIGENTE222')).toBe(false);
    expect(visitStore.has('u2:p2')).toBe(false);
  });
});
