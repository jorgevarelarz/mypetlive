import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import ProcessedEvent from '../models/processedEvent.model';
import { Donation } from '../models/donation.model';
import logger from '../utils/logger';

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

const headers = { 'Stripe-Signature': 't=1,v1=fake' } as any;
const rawBody = Buffer.from(JSON.stringify({ any: 'payload' }));

function sendWebhook() {
  return request(app)
    .post('/api/stripe/webhook')
    .set(headers)
    .set('Content-Type', 'application/json')
    .send(rawBody);
}

// Se fija la implementación en cada test: `jest.restoreAllMocks()` del
// afterEach puede dejar el mock de `constructEvent` sin implementación.
function stripeEvent(event: any) {
  const { __stripeMock } = jest.requireMock('../utils/stripe') as any;
  __stripeMock.webhooks.constructEvent.mockImplementation(() => event);
}

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

describe('Stripe webhook idempotency', () => {
  it('processes an event once and ignores duplicates', async () => {
    stripeEvent({
      id: 'evt_test_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_1', metadata: {} } },
    });

    const r1 = await sendWebhook();
    expect(r1.status).toBe(200);
    expect(r1.body.duplicate).toBeUndefined();

    const r2 = await sendWebhook();
    expect(r2.status).toBe(200);
    expect(r2.body.duplicate).toBe(true);

    const count = await ProcessedEvent.countDocuments({ provider: 'stripe', eventId: 'evt_test_1' });
    expect(count).toBe(1);
  });
});

describe('Stripe webhook: fallo al procesar', () => {
  const donationEvent = {
    id: 'evt_fail_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_fail',
        amount_total: 500,
        currency: 'eur',
        payment_intent: 'pi_x',
        metadata: { donation: 'true' },
      },
    },
  };

  beforeAll(async () => {
    await Donation.create({ sessionId: 'cs_test_fail', amount: 500, status: 'pending' });
  });

  it('si una rama lanza, responde 500 y no guarda el evento', async () => {
    stripeEvent(donationEvent);
    jest.spyOn(Donation, 'findOneAndUpdate').mockRejectedValueOnce(new Error('mongo caído'));

    const res = await sendWebhook();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'webhook_processing_failed' });
    expect(await ProcessedEvent.countDocuments({ eventId: 'evt_fail_1' })).toBe(0);
  });

  it('el reintento tras un fallo se procesa y no sale como duplicate', async () => {
    stripeEvent(donationEvent);

    const res = await sendWebhook();
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBeUndefined();

    const donation = await Donation.findOne({ sessionId: 'cs_test_fail' }).lean();
    expect(donation?.status).toBe('completed');
    expect(await ProcessedEvent.countDocuments({ eventId: 'evt_fail_1' })).toBe(1);
  });

  it('no registra datos personales al fallar', async () => {
    const event = { ...donationEvent, id: 'evt_fail_log' };
    stripeEvent(event);
    jest.spyOn(Donation, 'findOneAndUpdate').mockRejectedValueOnce(new Error('mongo caído'));
    const errorSpy = jest.spyOn(logger, 'error');

    const res = await sendWebhook();
    expect(res.status).toBe(500);

    const call = errorSpy.mock.calls.find(([fields]: any[]) => fields && fields.eventId === 'evt_fail_log');
    expect(call).toBeDefined();
    const [fields] = call as any[];
    expect(fields).toMatchObject({
      eventId: 'evt_fail_log',
      eventType: 'checkout.session.completed',
      errName: 'Error',
    });
    expect(fields).not.toHaveProperty('err');
    expect(fields).not.toHaveProperty('event');
    const serialized = JSON.stringify(call);
    expect(serialized).not.toContain('metadata');
    expect(serialized).not.toContain('cs_test_fail');
    expect(serialized).not.toContain('mongo caído');
  });
});
