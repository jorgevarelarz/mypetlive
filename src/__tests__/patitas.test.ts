import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { User } from '../models/user.model';
import { PatitaLog } from '../models/patitaLog.model';
import { Animal } from '../models/animal.model';
import { Coupon } from '../models/coupon.model';

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
  await Promise.all([User.deleteMany({}), PatitaLog.deleteMany({}), Animal.deleteMany({}), Coupon.deleteMany({})]);
});

const testUserHeaders = (role: string, id?: string) => {
  const userId = id || new mongoose.Types.ObjectId().toHexString();
  return {
    'x-user-id': userId,
    'x-user-role': role,
    'x-user-verified': 'true',
  };
};

describe('Patitas API', () => {
  it('returns the patitas balance for a specific shelter when requested by a tenant', async () => {
    const shelter = await User.create({
      name: 'Protectora Norte',
      email: 'shelter@example.com',
      passwordHash: 'hash',
      role: 'landlord',
      patitas: 12,
    });

    const res = await request(app)
      .get(`/api/protectora/patitas?shelterId=${shelter.id}`)
      .set(testUserHeaders('tenant'));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ patitas: 12, protectoraId: shelter.id });
  });

  it('returns the patitas balance for the logged protectora when no shelterId provided', async () => {
    const shelter = await User.create({
      name: 'Mi refugio',
      email: 'me@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
      patitas: 7,
    });

    const res = await request(app)
      .get('/api/protectora/patitas')
      .set(testUserHeaders('landlord', shelter.id));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ patitas: 7, protectoraId: shelter.id });
  });

  it('allows an admin to add patitas to a protectora balance', async () => {
    const shelter = await User.create({
      name: 'Protectora Sur',
      email: 'south@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
      patitas: 3,
    });

    const res = await request(app)
      .post(`/api/protectora/${shelter.id}/patitas/add`)
      .send({ amount: 5 })
      .set(testUserHeaders('admin'));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ patitas: 8, protectoraId: shelter.id });

    const refreshed = await User.findById(shelter.id);
    expect(refreshed?.patitas).toBe(8);
  });

  it('rejects invalid amounts when adding patitas', async () => {
    const shelter = await User.create({
      name: 'Protectora Oeste',
      email: 'west@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
    });

    const res = await request(app)
      .post(`/api/protectora/${shelter.id}/patitas/add`)
      .send({ amount: -2 })
      .set(testUserHeaders('admin'));

    expect(res.status).toBe(400);
    expect(res.body?.error).toBe('invalid_amount');
  });

  it('allows a protectora to spend Patitas with logging', async () => {
    const shelter = await User.create({
      name: 'Protectora Solidaria',
      email: 'solidaria@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
      patitas: 8,
    });

    const res = await request(app)
      .post('/api/patitas/spend')
      .set(testUserHeaders('landlord', shelter.id))
      .send({ amount: 5, partnerType: 'store', concept: 'Arena' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, newBalance: 3 });

    const refreshed = await User.findById(shelter.id);
    expect(refreshed?.patitas).toBe(3);

    const logs = await PatitaLog.find({ shelterId: shelter.id, source: 'store' }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0].amount).toBe(-5);
    expect(logs[0].concept).toBe('Arena');
  });

  it('exposes the list of protector as for selection', async () => {
    const shelter = await User.create({
      name: 'Protectora Esperanza',
      email: 'esperanza@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
    });

    const res = await request(app)
      .get('/api/protectoras')
      .set(testUserHeaders('tenant'));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.some((item: any) => item.id === String(shelter._id))).toBe(true);
  });

  it('prevents spending more Patitas than available', async () => {
    const shelter = await User.create({
      name: 'Protectora Limitada',
      email: 'limit@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
      patitas: 2,
    });

    const res = await request(app)
      .post('/api/patitas/spend')
      .set(testUserHeaders('landlord', shelter.id))
      .send({ amount: 5, partnerType: 'vet', concept: 'Chequeo' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('insufficient_patitas');
  });

  it('allows partners to register purchases that generate Patitas automatically', async () => {
    const shelter = await User.create({
      name: 'Protectora Compra',
      email: 'compra@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
      patitas: 0,
    });
    const partner = await User.create({
      name: 'Tienda Patitas',
      email: 'partner@store.app',
      passwordHash: 'hash',
      role: 'store',
    });
    const animal = await Animal.create({
      shelter: shelter._id,
      name: 'Pipo',
      species: 'dog',
      age: '1 año',
      size: 'medium',
      createdByRole: 'protectora',
      isPersonalPet: false,
    });

    const res = await request(app)
      .post('/api/purchases')
      .set(testUserHeaders('store', partner.id))
      .send({ animalId: animal.id, amount: 120, notes: 'Compra mensual' });

    expect(res.status).toBe(201);
    const updatedShelter = await User.findById(shelter.id);
    expect(updatedShelter?.patitas).toBeCloseTo(9.6);

    const logs = await PatitaLog.find({ source: 'purchase' }).lean();
    expect(logs).toHaveLength(1);
    expect(String(logs[0].animalId)).toBe(String(animal.id));
    expect(String(logs[0].partnerId)).toBe(partner.id);
  });
});
