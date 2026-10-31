import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

/** Lector de código de barras de comida y arena (21-10-2026). */
let app: any;
let mongo: MongoMemoryServer | undefined;
const headers = { 'x-user-id': new mongoose.Types.ObjectId().toHexString(), 'x-user-role': 'tenant' };
const realFetch = global.fetch;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  const mod = await import('../app');
  app = mod.app || mod.default;
  const { PetProduct } = await import('../models/petProduct.model');
  await PetProduct.syncIndexes();
});

afterEach(() => { global.fetch = realFetch; });

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

it('busca en Open Pet Food Facts lo que no conoce y lo guarda', async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ product: { product_name: 'Indoor 27', brands: 'Royal Canin', categories_tags: ['en:cat-food'] } }),
  })) as any;
  let res = await request(app).get('/api/catalog/pet-products/barcode/3182550704625').set(headers).expect(200);
  expect(res.body).toEqual(expect.objectContaining({ name: 'Royal Canin Indoor 27', kind: 'food' }));
  // La segunda vez ya sale del catálogo, sin preguntar fuera.
  global.fetch = jest.fn() as any;
  res = await request(app).get('/api/catalog/pet-products/barcode/3182550704625').set(headers).expect(200);
  expect(res.body.name).toBe('Royal Canin Indoor 27');
  expect(global.fetch).not.toHaveBeenCalled();
});

it('un código desconocido da 404 y se puede enseñar con un nombre', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) })) as any;
  await request(app).get('/api/catalog/pet-products/barcode/8400000000017').set(headers).expect(404);
  await request(app).post('/api/catalog/pet-products/barcode/8400000000017').set(headers)
    .send({ name: 'Arena del súper', kind: 'litter' }).expect(200);
  const res = await request(app).get('/api/catalog/pet-products/barcode/8400000000017').set(headers).expect(200);
  expect(res.body).toEqual(expect.objectContaining({ name: 'Arena del súper', kind: 'litter' }));
});
