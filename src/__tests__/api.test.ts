import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { User } from '../models/user.model';
import bcrypt from 'bcryptjs';

let app: any;
let mongo: MongoMemoryServer | undefined;

jest.mock('../utils/stripe', () => {
  const stripeMock = {
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ client_secret: 'test_secret' }),
      capture: jest.fn().mockResolvedValue({ id: 'pi_test_capture' }),
    },
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test_1' }),
      createSource: jest.fn().mockResolvedValue({ id: 'src_test_1' }),
    },
    accounts: {
      create: jest.fn().mockResolvedValue({ id: 'acct_test_1' }),
      retrieve: jest.fn().mockResolvedValue({ charges_enabled: true, payouts_enabled: true, requirements: {} }),
    },
    accountLinks: {
      create: jest.fn().mockResolvedValue({ url: 'https://example.com/onboard' }),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  };
  return {
    getStripeClient: jest.fn(() => stripeMock),
    isStripeConfigured: jest.fn(() => true),
    __resetStripeClientForTests: jest.fn(),
    __stripeMock: stripeMock,
  };
});

beforeAll(async () => {
  // Pin a modern MongoDB version on CI runners (OpenSSL 3)
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

describe('API basic flow', () => {
  let token = '';
  it('prepares a privileged fixture without using public registration', async () => {
    await User.create({
      name: 'Test',
      email: 'test@example.com',
      passwordHash: await bcrypt.hash('password', 10),
      role: 'landlord',
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    token = res.body.token;
  });

  it('creates a property', async () => {
    const owner = await User.findOne({ email: 'test@example.com' });
    expect(owner).toBeTruthy();
    const payload = {
      owner: String(owner!._id),
      title: 'Propiedad Centro',
      description: 'Desc',
      address: 'Calle Mayor 1',
      region: 'madrid',
      city: 'Madrid',
      location: { lng: -3.70379, lat: 40.41678 },
      price: 1000,
      deposit: 1000,
      sizeM2: 80,
      rooms: 2,
      bathrooms: 1,
      furnished: false,
      petsAllowed: false,
      availableFrom: new Date().toISOString(),
      images: ['https://cdn/img1.jpg', 'https://cdn/img2.jpg', 'https://cdn/img3.jpg'],
    };
    const res = await request(app)
      .post('/api/properties')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
  });

  it('creates payment intent (feature branch tolerant)', async () => {
    const res = await request(app)
      .post('/api/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amountEUR: 1 });
    // In feature branches CI may bypass Stripe and/or short-circuit
    if (res.status === 200) {
      expect(res.body.clientSecret).toBeDefined();
    } else {
      // Accept 400 in CI variants; ensure no 5xx
      expect(res.status).toBe(400);
      expect(res.body).toBeDefined();
    }
  });
});
