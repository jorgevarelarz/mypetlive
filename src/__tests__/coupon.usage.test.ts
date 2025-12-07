import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { Coupon } from '../models/coupon.model';
import { User } from '../models/user.model';
import { PatitaLog } from '../models/patitaLog.model';

let app: any;
let mongo: MongoMemoryServer | undefined;

const code = 'BONO-555';

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
  await Promise.all([Coupon.deleteMany({}), PatitaLog.deleteMany({}), User.deleteMany({})]);
});

const testUserHeaders = (role: string, id?: string) => {
  const userId = id || new mongoose.Types.ObjectId().toHexString();
  return {
    'x-user-id': userId,
    'x-user-role': role,
    'x-user-verified': 'true',
  };
};

describe('Coupon partner usage flow', () => {
  it('allows admin to create and toggle coupons with partner assignment', async () => {
    const store = await User.create({
      name: 'Tienda Centro',
      email: 'store@example.com',
      passwordHash: 'hash',
      role: 'store',
    });

    const created = await request(app)
      .post('/api/admin/coupons')
      .set(testUserHeaders('admin'))
      .send({ partnerId: store.id, copy: '10% en snacks', discount: '-10%' });

    expect(created.status).toBe(201);
    expect(created.body.partnerId).toBe(String(store.id));

    const listed = await request(app)
      .get('/api/admin/coupons')
      .set(testUserHeaders('admin'));
    expect(listed.status).toBe(200);
    expect(listed.body.items.length).toBeGreaterThanOrEqual(1);

    const toggled = await request(app)
      .patch(`/api/admin/coupons/${created.body._id}/toggle`)
      .set(testUserHeaders('admin'));
    expect(toggled.status).toBe(200);
    expect(toggled.body.active).toBe(false);
  });

  it('lists available coupons per animal code for partners', async () => {
    const store = await User.create({
      name: 'Tienda Norte',
      email: 'norte@store.app',
      passwordHash: 'hash',
      role: 'store',
    });
    await Coupon.create({
      partnerId: store._id,
      partnerType: 'store',
      copy: 'Cupón Bono',
      title: 'Cupón Bono',
      description: 'Solo para Bono',
      discount: '-10%',
      targetAnimalCode: code,
      active: true,
    });

    const res = await request(app)
      .get(`/api/coupons/available?code=${code}`)
      .set(testUserHeaders('store', store.id));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].targetAnimalCode).toBe(code);
  });

  it('marks a coupon as used and attaches it to a Patita log', async () => {
    const vet = await User.create({
      name: 'Vet Bonus',
      email: 'vet@clinic.app',
      passwordHash: 'hash',
      role: 'vet',
    });
    const coupon = await Coupon.create({
      partnerId: vet._id,
      partnerType: 'vet',
      copy: 'Vacuna extra',
      title: 'Vacuna extra',
      description: 'Incluye revisión',
      discount: '-20%',
      targetAnimalCode: code,
      active: true,
    });

    const shelter = await User.create({
      name: 'Protectora Bonus',
      email: 'bonus@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
    });

    const log = await PatitaLog.create({
      shelterId: shelter._id,
      userId: shelter._id,
      amount: -30,
      source: 'vet',
      concept: 'Chequeo',
    });

    const res = await request(app)
      .post(`/api/coupons/${coupon.id}/use`)
      .set(testUserHeaders('vet', vet.id))
      .send({ animalCode: code, logId: log.id });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.coupon.usedAt).toBeTruthy();

    const updated = await Coupon.findById(coupon.id);
    expect(updated?.usedAt).toBeTruthy();
    expect(updated?.usedBy).toBeDefined();

    const updatedLog = await PatitaLog.findById(log.id);
    expect(String(updatedLog?.couponId)).toBe(String(coupon.id));

    const secondAttempt = await request(app)
      .post(`/api/coupons/${coupon.id}/use`)
      .set(testUserHeaders('vet', vet.id))
      .send({ animalCode: code, logId: log.id });
    expect(secondAttempt.status).toBe(400);
    expect(secondAttempt.body.error).toBe('coupon_already_used');
  });
});
