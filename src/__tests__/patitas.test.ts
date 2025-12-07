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

  it('allows a tenant to echo a Patita and logs the event', async () => {
    const shelter = await User.create({
      name: 'Protectora Este',
      email: 'east@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
      patitas: 0,
    });

    const tenantId = new mongoose.Types.ObjectId().toHexString();

    const res = await request(app)
      .post('/api/patitas/echo')
      .send({ shelterId: shelter.id })
      .set(testUserHeaders('tenant', tenantId));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.newBalance).toBe(1);

    const refreshed = await User.findById(shelter.id);
    expect(refreshed?.patitas).toBe(1);

    const logs = await PatitaLog.find({ shelterId: shelter.id }).lean();
    expect(logs).toHaveLength(1);
    expect(String(logs[0].userId)).toBe(tenantId);
    expect(logs[0].source).toBe('click');
  });

  it('rate limits Patita clicks per tenant', async () => {
    const shelter = await User.create({
      name: 'Protectora Centro',
      email: 'center@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
      patitas: 0,
    });

    const tenantId = new mongoose.Types.ObjectId().toHexString();

    for (let i = 0; i < 10; i += 1) {
      const okRes = await request(app)
        .post('/api/patitas/echo')
        .send({ shelterId: shelter.id })
        .set(testUserHeaders('tenant', tenantId));
      expect(okRes.status).toBe(200);
    }

    const limited = await request(app)
      .post('/api/patitas/echo')
      .send({ shelterId: shelter.id })
      .set(testUserHeaders('tenant', tenantId));

    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe('patitas_rate_limited');
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

  it('lists pending Patita logs for partner roles', async () => {
    const shelter = await User.create({
      name: 'Protectora',
      email: 'pending@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
    });
    const animal = await Animal.create({
      shelter: shelter._id,
      name: 'Neko',
      species: 'cat',
      sex: 'female',
      age: '2 años',
      size: 'small',
      createdByRole: 'protectora',
      isPersonalPet: false,
    });
    await PatitaLog.create({
      shelterId: shelter._id,
      userId: shelter._id,
      animalId: animal._id,
      amount: -3,
      source: 'store',
      concept: 'Pienso',
    });

    const res = await request(app)
      .get('/api/patitas/pending')
      .set(testUserHeaders('store'))
      .expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('allows vets to confirm logs and records health entry', async () => {
    const shelter = await User.create({
      name: 'Protectora',
      email: 'vetconfirm@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
    });
    const animal = await Animal.create({
      shelter: shelter._id,
      name: 'Luna',
      species: 'cat',
      sex: 'female',
      age: '3 años',
      size: 'small',
      createdByRole: 'protectora',
      isPersonalPet: false,
    });
    const log = await PatitaLog.create({
      shelterId: shelter._id,
      userId: shelter._id,
      animalId: animal._id,
      amount: -4,
      source: 'vet',
      concept: 'Consulta',
    });

    await request(app)
      .post('/api/patitas/confirm')
      .set(testUserHeaders('vet'))
      .send({ logId: log.id, proofImageUrl: 'https://img/proof.jpg', treatmentType: 'Vacuna', notes: 'Todo ok' })
      .expect(200);

    const updatedLog = await PatitaLog.findById(log.id).lean();
    expect(updatedLog?.proofImageUrl).toBe('https://img/proof.jpg');

    const updatedAnimal: any = await Animal.findById(animal.id).lean();
    expect(updatedAnimal?.healthHistory?.length).toBe(1);
    expect(updatedAnimal?.healthHistory?.[0]?.type).toBe('Vacuna');
  });

  it('validates coupon target animal codes during confirmation', async () => {
    const shelter = await User.create({
      name: 'Protectora',
      email: 'coupon@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
    });
    const animal = await Animal.create({
      shelter: shelter._id,
      name: 'Milo',
      species: 'cat',
      sex: 'male',
      age: '2 años',
      size: 'small',
      code: 'MILO-123',
       createdByRole: 'protectora',
       isPersonalPet: false,
    });
    const store = await User.create({
      name: 'Tienda Cupones',
      email: 'store@shelter.app',
      passwordHash: 'hash',
      role: 'store',
    });
    const coupon = await Coupon.create({
      partnerId: store._id,
      partnerType: 'store',
      copy: 'Especial Milo',
      title: 'Especial Milo',
      description: 'Solo para Milo',
      discount: '-10%',
      targetAnimalCode: 'OTRO-999',
    });
    const log = await PatitaLog.create({
      shelterId: shelter._id,
      userId: shelter._id,
      animalId: animal._id,
      amount: -4,
      source: 'store',
      concept: 'Cupón',
      couponId: coupon._id,
    });

    const mismatch = await request(app)
      .post('/api/patitas/confirm')
      .set(testUserHeaders('store'))
      .send({ logId: log.id, proofImageUrl: 'https://img/proof.jpg' });

    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error).toBe('coupon_animal_mismatch');

    await Coupon.findByIdAndUpdate(coupon._id, { targetAnimalCode: 'MILO-123' });

    await request(app)
      .post('/api/patitas/confirm')
      .set(testUserHeaders('store'))
      .send({ logId: log.id, proofImageUrl: 'https://img/proof.jpg' })
      .expect(200);
  });

  it('awards coupon bonus Patitas when confirming coupon spends', async () => {
    const shelter = await User.create({
      name: 'Protectora Bonus',
      email: 'bonus@shelter.app',
      passwordHash: 'hash',
      role: 'landlord',
      patitas: 0,
    });
    const animal = await Animal.create({
      shelter: shelter._id,
      name: 'Bono',
      species: 'cat',
      sex: 'male',
      age: '2 años',
      size: 'small',
      code: 'BONO-555',
      createdByRole: 'protectora',
      isPersonalPet: false,
    });
    const store = await User.create({
      name: 'Store Bonus',
      email: 'bonus@store.app',
      passwordHash: 'hash',
      role: 'store',
    });
    const coupon = await Coupon.create({
      partnerId: store._id,
      partnerType: 'store',
      copy: 'Cupón Bono',
      title: 'Cupón Bono',
      description: 'Solo para Bono',
      discount: '-15%',
      targetAnimalCode: 'BONO-555',
    });
    const log = await PatitaLog.create({
      shelterId: shelter._id,
      userId: shelter._id,
      animalId: animal._id,
      amount: -100,
      source: 'store',
      concept: 'Compra Bono',
      couponId: coupon._id,
    });

    const res = await request(app)
      .post('/api/patitas/confirm')
      .set(testUserHeaders('store'))
      .send({ logId: log.id, proofImageUrl: 'https://img/proof.jpg' });

    expect(res.status).toBe(200);
    expect(res.body?.couponDonation?.amount).toBeCloseTo(4);
    expect(res.body?.couponDonation?.shelterId).toBe(String(shelter._id));

    const refreshedShelter = await User.findById(shelter._id);
    expect(refreshedShelter?.patitas).toBeCloseTo(4);

    const bonusLogs = await PatitaLog.find({ source: 'coupon_bonus', shelterId: shelter._id }).lean();
    expect(bonusLogs).toHaveLength(1);
    expect(bonusLogs[0].amount).toBeCloseTo(4);
    expect(bonusLogs[0].couponId?.toString()).toBe(String(coupon._id));
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
