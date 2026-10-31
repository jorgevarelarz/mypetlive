import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

/** Pantalla de Patitas (21-10-2026): «Qué se ha hecho con tus Patitas». */
let app: any;
let mongo: MongoMemoryServer | undefined;
const userId = new mongoose.Types.ObjectId();
const headers = { 'x-user-id': userId.toHexString(), 'x-user-role': 'tenant' };

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

it('resume origen, donaciones por protectora y en qué las usó cada una', async () => {
  const { User } = await import('../models/user.model');
  const { PatitaTxn } = await import('../models/patitaTxn.model');
  const shelter = await User.create({ name: 'Protectora Sol', email: 'sol@example.com', role: 'landlord', passwordHash: 'x' });
  await PatitaTxn.create([
    { type: 'earn', userId, amount: 40, source: 'coupon' },
    { type: 'earn', userId, amount: 10, source: 'visit' },
    { type: 'donate', userId, shelterId: shelter._id, amount: 30, concept: 'Auto-donación' },
    { type: 'donate', userId, shelterId: shelter._id, amount: 5, concept: 'Donación de Patitas' },
    { type: 'redeem', shelterId: shelter._id, amount: 100, valueEur: 10, concept: 'Cita veterinaria' },
  ]);
  const res = await request(app).get('/api/patitas/me/impact').set(headers).expect(200);
  expect(res.body.earned).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: 'coupon', amount: 40 }),
    expect.objectContaining({ source: 'visit', amount: 10 }),
  ]));
  expect(res.body.shelters).toHaveLength(1);
  expect(res.body.shelters[0]).toEqual(expect.objectContaining({ name: 'Protectora Sol', donated: 35, auto: 30 }));
  expect(res.body.shelters[0].uses).toEqual([expect.objectContaining({ concept: 'Cita veterinaria', amount: 100, valueEur: 10 })]);
});
