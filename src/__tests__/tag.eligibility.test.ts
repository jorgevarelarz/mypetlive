import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

/**
 * «Mi mascota» (21-10-2026): sin pedido de chapa se ofrece comprarla; con un
 * pedido pagado aparece «Registrar chapa». Un pedido pendiente de pago no vale.
 */
let app: any;
let mongo: MongoMemoryServer | undefined;
const userId = new mongoose.Types.ObjectId().toHexString();
const headers = { 'x-user-id': userId, 'x-user-role': 'tenant' };

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  const mod = await import('../app');
  app = mod.app || mod.default;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

describe('GET /api/tags/eligibility', () => {
  it('sin producto chapa no ofrece nada', async () => {
    const res = await request(app).get('/api/tags/eligibility').set(headers).expect(200);
    expect(res.body).toEqual({ productId: null, priceEur: null, purchased: false });
  });

  it('con pedido pendiente aún no; pagado sí', async () => {
    const { Product } = await import('../models/product.model');
    const { Order } = await import('../models/order.model');
    const product = await Product.create({ listedBy: 'platform', name: 'Chapa', priceEur: 15, stock: 10, sku: 'chapa-qr' });
    const base = {
      reference: 'MPL-TEST-1',
      listedBy: 'platform',
      buyer: { userId, email: 'a@example.com', name: 'A' },
      items: [{ productId: product._id, name: 'Chapa', priceEur: 15, qty: 1 }],
      shippingAddress: { line1: 'Calle 1', city: 'Coruña', postalCode: '15001' },
      subtotalEur: 15, shippingEur: 4.9, totalEur: 19.9,
    };
    const order: any = await Order.create({ ...base, status: 'pending_payment' });
    let res = await request(app).get('/api/tags/eligibility').set(headers).expect(200);
    expect(res.body.productId).toBe(String(product._id));
    expect(res.body.purchased).toBe(false);
    order.status = 'paid';
    await order.save();
    res = await request(app).get('/api/tags/eligibility').set(headers).expect(200);
    expect(res.body.purchased).toBe(true);
  });
});
