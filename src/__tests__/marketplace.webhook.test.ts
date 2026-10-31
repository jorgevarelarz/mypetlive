import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { startMongoMemoryReplicaSet } from './utils/mongoMemoryServer';

// Stripe simulado: cada test fija el evento que "llega" firmado. Ninguna
// prueba llama al proveedor real.
jest.mock('../utils/stripe', () => {
  const stripeMock = {
    webhooks: { constructEvent: jest.fn() },
  };
  return {
    getStripeClient: jest.fn(() => stripeMock),
    isStripeConfigured: jest.fn(() => true),
    __resetStripeClientForTests: jest.fn(),
    __stripeMock: stripeMock,
  };
});
import { getStripeClient } from '../utils/stripe';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));
import { sendEmail } from '../utils/notification';

let app: any;
let mongo: MongoMemoryReplSet | undefined;
let User: any;
let Product: any;
let Order: any;

beforeAll(async () => {
  mongo = await startMongoMemoryReplicaSet();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_URL = 'https://mypetlive.example';
  process.env.ALLOW_UNVERIFIED = 'true';
  delete process.env.STRIPE_SECRET_KEY;
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Product = (await import('../models/product.model')).Product;
  Order = (await import('../models/order.model')).Order;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const storeId = new mongoose.Types.ObjectId().toHexString();
const buyerId = new mongoose.Types.ObjectId().toHexString();
const address = { line1: 'Rúa Real 12', city: 'A Coruña', postalCode: '15003', country: 'ES' };

beforeEach(async () => {
  (sendEmail as jest.Mock).mockClear();
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: storeId, name: 'Tienda Norte', email: 'store@test.com', passwordHash: 'x', role: 'store' },
    { _id: buyerId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
});

// Igual que `seedPendingOrder` en marketplace.test.ts: un pedido pendiente ya
// tiene su stock reservado, así que se reserva a mano.
async function seedPendingOrder(overrides: Record<string, any> = {}) {
  const product = await Product.create({
    listedBy: 'partner',
    sellerId: storeId,
    name: 'Pienso cachorro 3kg',
    category: 'comida',
    priceEur: 20,
    stock: 5,
  });
  const qty = 2;
  await Product.updateOne({ _id: product._id }, { $inc: { stock: -qty } });
  const order = await Order.create({
    reference: 'MP-TEST-0002',
    listedBy: 'partner',
    sellerId: storeId,
    buyer: { userId: buyerId, email: 'ana@test.com', name: 'Ana' },
    items: [{ productId: product._id, name: product.name, priceEur: 20, qty }],
    shippingAddress: address,
    subtotalEur: 40,
    shippingEur: 0,
    totalEur: 40,
    commissionPct: 8,
    commissionEur: 3.2,
    ...overrides,
  });
  return { product, order };
}

let eventSeq = 0;

async function sendEvent(type: string, orderId: string, session: Record<string, any> = {}) {
  eventSeq += 1;
  const event = {
    id: `evt_mp_${eventSeq}_${Date.now()}`,
    type,
    data: {
      object: {
        id: `cs_mp_${eventSeq}`,
        payment_intent: `pi_mp_${eventSeq}`,
        payment_status: 'paid',
        amount_total: 4000,
        currency: 'eur',
        metadata: { marketplaceOrderId: orderId },
        ...session,
      },
    },
  };
  const stripe: any = getStripeClient();
  (stripe.webhooks.constructEvent as jest.Mock).mockReturnValueOnce(event);
  const res = await request(app)
    .post('/api/stripe/webhook')
    .set('Stripe-Signature', 't=1,v1=fake')
    .set('Content-Type', 'application/json')
    .send(Buffer.from(JSON.stringify({ any: 'payload' })));
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ received: true });
  return event;
}

describe('Webhook del marketplace: confirmar solo lo cobrado', () => {
  it('completed con pago aún sin cobrar (SEPA) no confirma el pedido', async () => {
    const { order } = await seedPendingOrder();
    await sendEvent('checkout.session.completed', String(order._id), { payment_status: 'unpaid' });
    const after: any = await Order.findById(order._id).lean();
    expect(after.status).toBe('pending_payment');
    expect(after.paidAt).toBeFalsy();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('completed pagado pero con un importe distinto del pedido no confirma', async () => {
    const { order } = await seedPendingOrder();
    await sendEvent('checkout.session.completed', String(order._id), { amount_total: 3999 });
    const after: any = await Order.findById(order._id).lean();
    expect(after.status).toBe('pending_payment');
    expect(after.paidAt).toBeFalsy();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('completed pagado en otra moneda no confirma', async () => {
    const { order } = await seedPendingOrder();
    await sendEvent('checkout.session.completed', String(order._id), { currency: 'usd' });
    const after: any = await Order.findById(order._id).lean();
    expect(after.status).toBe('pending_payment');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('completed pagado, con el importe y la moneda del pedido, lo confirma', async () => {
    const { order } = await seedPendingOrder();
    const event = await sendEvent('checkout.session.completed', String(order._id), { currency: 'EUR' });
    const after: any = await Order.findById(order._id).lean();
    expect(after.status).toBe('paid');
    expect(after.paymentRef).toBe(event.data.object.payment_intent);
    expect(after.paidAt).toBeTruthy();
  });

  it('async_payment_succeeded confirma el pedido que llegó sin cobrar', async () => {
    const { order } = await seedPendingOrder();
    await sendEvent('checkout.session.completed', String(order._id), { payment_status: 'unpaid' });
    expect((await Order.findById(order._id).lean()).status).toBe('pending_payment');
    const event = await sendEvent('checkout.session.async_payment_succeeded', String(order._id));
    const after: any = await Order.findById(order._id).lean();
    expect(after.status).toBe('paid');
    expect(after.paymentRef).toBe(event.data.object.payment_intent);
  });

  it('async_payment_failed cancela el pedido y devuelve el stock reservado', async () => {
    const { order, product } = await seedPendingOrder();
    const before = (await Product.findById(product._id).lean()).stock;
    await sendEvent('checkout.session.async_payment_failed', String(order._id), { payment_status: 'unpaid' });
    expect((await Order.findById(order._id).lean()).status).toBe('cancelled');
    expect((await Product.findById(product._id).lean()).stock).toBe(before + order.items[0].qty);
  });

  it('async_payment_failed no toca un pedido ya pagado', async () => {
    const { order, product } = await seedPendingOrder({ status: 'paid' });
    const before = (await Product.findById(product._id).lean()).stock;
    await sendEvent('checkout.session.async_payment_failed', String(order._id), { payment_status: 'unpaid' });
    expect((await Order.findById(order._id).lean()).status).toBe('paid');
    expect((await Product.findById(product._id).lean()).stock).toBe(before);
  });
});
