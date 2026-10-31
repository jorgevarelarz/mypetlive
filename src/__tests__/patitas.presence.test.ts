import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

// Ventas y visitas de Patitas exigen prueba de presencia del cliente (QR o
// código corto), igual que identifyUser y el TPV: un userId suelto no vale,
// porque permitiría generar Patitas (dinero real al canjearse) sin cliente.

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Sale: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Sale = (await import('../models/sale.model')).Sale;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const storeId = new mongoose.Types.ObjectId().toHexString();
const clientAId = new mongoose.Types.ObjectId().toHexString();
const clientBId = new mongoose.Types.ObjectId().toHexString();
const storeH = { 'x-user-id': storeId, 'x-user-role': 'store', 'x-user-verified': 'true' };
const clientAH = { 'x-user-id': clientAId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: storeId, name: 'Tienda Norte', email: 'store@test.com', passwordHash: 'x', role: 'store' },
    { _id: clientAId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant', patitas: 0 },
    { _id: clientBId, name: 'Luis', email: 'luis@test.com', passwordHash: 'x', role: 'tenant', patitas: 0 },
  ]);
});

async function patitas(id: string): Promise<number> {
  const u: any = await User.findById(id).select('patitas').lean();
  return u?.patitas || 0;
}

async function myCode(): Promise<{ token: string; code: string }> {
  const res = await request(app).get('/api/patitas/my-code').set(clientAH).expect(200);
  return res.body;
}

describe('Ventas y visitas de Patitas: prueba de presencia del cliente', () => {
  it('rechaza una venta con solo userId: 400 invalid_user, sin Sale ni Patitas', async () => {
    const res = await request(app)
      .post('/api/patitas/sales')
      .set(storeH)
      .send({ userId: clientAId, amountEur: 10 })
      .expect(400);
    expect(res.body).toEqual({ error: 'invalid_user' });
    expect(await Sale.countDocuments()).toBe(0);
    expect(await patitas(clientAId)).toBe(0);
  });

  it('rechaza una visita con solo userId: 400 invalid_user, sin Patitas', async () => {
    const res = await request(app)
      .post('/api/patitas/earn/visit')
      .set(storeH)
      .send({ userId: clientAId })
      .expect(400);
    expect(res.body).toEqual({ error: 'invalid_user' });
    expect(await patitas(clientAId)).toBe(0);
  });

  it('acepta venta y visita con el userToken del cliente', async () => {
    const { token } = await myCode();
    const sale = await request(app)
      .post('/api/patitas/sales')
      .set(storeH)
      .send({ userToken: token, amountEur: 10 })
      .expect(201);
    expect(sale.body.saleId).toBeTruthy();
    expect(sale.body.patitasEarned).toBe(10);
    expect(await patitas(clientAId)).toBe(10);

    const visit = await request(app)
      .post('/api/patitas/earn/visit')
      .set(storeH)
      .send({ userToken: token })
      .expect(200);
    expect(visit.body.earned).toBeGreaterThan(0);
    expect(await patitas(clientAId)).toBe(10 + visit.body.earned);
  });

  it('acepta una venta con el código corto vigente', async () => {
    const { code } = await myCode();
    await request(app)
      .post('/api/patitas/sales')
      .set(storeH)
      .send({ code, amountEur: 12 })
      .expect(201);
    expect(await patitas(clientAId)).toBe(12);
  });

  it('acepta una visita con el código corto vigente', async () => {
    const { code } = await myCode();
    const res = await request(app)
      .post('/api/patitas/earn/visit')
      .set(storeH)
      .send({ code })
      .expect(200);
    expect(res.body.earned).toBeGreaterThan(0);
  });

  it('con userToken de A y userId de B, las Patitas van a A', async () => {
    const { token } = await myCode();
    await request(app)
      .post('/api/patitas/sales')
      .set(storeH)
      .send({ userToken: token, userId: clientBId, amountEur: 20 })
      .expect(201);
    expect(await patitas(clientAId)).toBe(20);
    expect(await patitas(clientBId)).toBe(0);
  });

  it('rechaza un código inexistente en venta y visita', async () => {
    const sale = await request(app)
      .post('/api/patitas/sales')
      .set(storeH)
      .send({ code: 'ZZZZZZ', amountEur: 10 })
      .expect(400);
    expect(sale.body).toEqual({ error: 'invalid_user' });
    const visit = await request(app)
      .post('/api/patitas/earn/visit')
      .set(storeH)
      .send({ code: 'ZZZZZZ' })
      .expect(400);
    expect(visit.body).toEqual({ error: 'invalid_user' });
    expect(await Sale.countDocuments()).toBe(0);
  });
});
