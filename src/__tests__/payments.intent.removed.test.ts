import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { User } from '../models/user.model';

const mockPaymentIntentsCreate = jest.fn().mockResolvedValue({ client_secret: 'pi_secret_synthetic' });

jest.mock('../utils/stripe', () => ({
  isStripeConfigured: () => true,
  getStripeClient: () => ({
    paymentIntents: { create: mockPaymentIntentsCreate },
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_synthetic' }) },
  }),
  __resetStripeClientForTests: () => undefined,
}));

let app: any;
let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  mockPaymentIntentsCreate.mockClear();
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
});

const crearUsuarioConToken = async () => {
  const user = await User.create({
    name: 'Usuario Pagos',
    email: 'pagos@example.com',
    passwordHash: 'hash',
    role: 'tenant',
  });
  const token = jwt.sign({ id: user.id, role: 'tenant' }, 'insecure', { expiresIn: '1h' });
  return token;
};

describe('POST /api/payments/intent eliminada', () => {
  it('responde 404 sin clientSecret y no crea ningún PaymentIntent', async () => {
    const token = await crearUsuarioConToken();

    const res = await request(app)
      .post('/api/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amountEUR: 10 });

    expect(res.status).toBe(404);
    expect(res.body?.clientSecret).toBeUndefined();
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('mantiene montada POST /api/payments/customer', async () => {
    const token = await crearUsuarioConToken();

    const res = await request(app)
      .post('/api/payments/customer')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).not.toBe(404);
  });
});
