import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import ProcessedEvent from '../models/processedEvent.model';

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
      constructEvent: jest.fn().mockImplementation((_body: any, _sig: string, _secret: string) => ({
        id: 'evt_test_1',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test_1', metadata: {} } },
      })),
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

describe('Stripe webhook idempotency', () => {
  it('processes an event once and ignores duplicates', async () => {
    const rawBody = Buffer.from(JSON.stringify({ any: 'payload' }));
    const headers = { 'Stripe-Signature': 't=1,v1=fake' } as any;

    const r1 = await request(app)
      .post('/api/stripe/webhook')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(rawBody);
    expect(r1.status).toBe(200);

    const r2 = await request(app)
      .post('/api/stripe/webhook')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(rawBody);
    expect(r2.status).toBe(200);

    const count = await ProcessedEvent.countDocuments({ provider: 'stripe', eventId: 'evt_test_1' });
    expect(count).toBe(1);
  });
});

describe('Stripe webhook sin secreto fuera de test', () => {
  const { __stripeMock } = jest.requireMock('../utils/stripe');
  const rawBody = Buffer.from(JSON.stringify({ any: 'payload' }));
  let savedNodeEnv: string | undefined;
  let savedSecret: string | undefined;

  const postWebhook = () =>
    request(app)
      .post('/api/stripe/webhook')
      .set('Stripe-Signature', 't=1,v1=fake')
      .set('Content-Type', 'application/json')
      .send(rawBody);

  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  beforeEach(async () => {
    savedNodeEnv = process.env.NODE_ENV;
    savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
    __stripeMock.webhooks.constructEvent.mockClear();
    await ProcessedEvent.deleteMany({});
  });

  afterEach(async () => {
    restore('NODE_ENV', savedNodeEnv);
    restore('STRIPE_WEBHOOK_SECRET', savedSecret);
    await ProcessedEvent.deleteMany({});
  });

  const expectRejected = async () => {
    const res = await postWebhook();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'stripe_webhook_secret_missing' });
    expect(__stripeMock.webhooks.constructEvent).not.toHaveBeenCalled();
    expect(await ProcessedEvent.countDocuments()).toBe(0);
  };

  it('rechaza con 500 en development si el secreto está vacío', async () => {
    process.env.NODE_ENV = 'development';
    process.env.STRIPE_WEBHOOK_SECRET = '';
    await expectRejected();
  });

  it('rechaza con 500 en development si el secreto no está definido', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.STRIPE_WEBHOOK_SECRET;
    await expectRejected();
  });

  it('rechaza con 500 en development si el secreto solo tiene espacios', async () => {
    process.env.NODE_ENV = 'development';
    process.env.STRIPE_WEBHOOK_SECRET = '   ';
    await expectRejected();
  });

  it('procesa el evento en development si hay secreto', async () => {
    process.env.NODE_ENV = 'development';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake';
    const res = await postWebhook();
    expect(res.status).toBe(200);
    expect(__stripeMock.webhooks.constructEvent).toHaveBeenCalledTimes(1);
    expect(await ProcessedEvent.countDocuments({ provider: 'stripe', eventId: 'evt_test_1' })).toBe(1);
  });
});
