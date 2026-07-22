import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let Adoption: any;
let Donation: any;
let PatitaTxn: any;
let Coupon: any;
let Sale: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
  Adoption = (await import('../models/adoption.model')).Adoption;
  Donation = (await import('../models/donation.model')).Donation;
  PatitaTxn = (await import('../models/patitaTxn.model')).PatitaTxn;
  Coupon = (await import('../models/coupon.model')).Coupon;
  Sale = (await import('../models/sale.model')).Sale;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const shelterId = new mongoose.Types.ObjectId();
const partnerId = new mongoose.Types.ObjectId();
const adopterId = new mongoose.Types.ObjectId();
const vetId = new mongoose.Types.ObjectId();
const adminH = { 'x-user-id': new mongoose.Types.ObjectId().toHexString(), 'x-user-role': 'admin', 'x-user-verified': 'true' };
const tenantH = { 'x-user-id': adopterId.toHexString(), 'x-user-role': 'tenant', 'x-user-verified': 'true' };

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: shelterId, name: 'Protectora Sur', email: 's@test.com', passwordHash: 'x', role: 'landlord' },
    { _id: partnerId, name: 'Tienda Norte', email: 'p@test.com', passwordHash: 'x', role: 'store' },
    { _id: adopterId, name: 'Ana', email: 'a@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: vetId, name: 'Clínica Vet', email: 'v@test.com', passwordHash: 'x', role: 'vet' },
  ]);
});

async function seedPlatformData() {
  const [luna, michi] = await Animal.create([
    { name: 'Luna', species: 'gato', sex: 'female', age: '2 años', size: 'small', shelter: shelterId, createdByRole: 'protectora', status: 'adoptado' },
    { name: 'Michi', species: 'gato', sex: 'male', age: '1 año', size: 'small', shelter: shelterId, createdByRole: 'protectora', status: 'publicado' },
  ]);
  await Adoption.collection.insertMany([
    { animalId: String(luna._id), adopterId: String(adopterId), status: 'aprobada', createdAt: daysAgo(6), updatedAt: daysAgo(1) },
    { animalId: String(michi._id), adopterId: String(adopterId), status: 'rechazada', createdAt: daysAgo(4), updatedAt: daysAgo(3) },
    { animalId: String(michi._id), adopterId: String(adopterId), status: 'en_revision', createdAt: daysAgo(2), updatedAt: daysAgo(2) },
  ]);
  await Donation.create([
    { animalId: String(luna._id), userId: String(adopterId), amount: 2500, status: 'completed' },
    { animalId: String(luna._id), userId: String(adopterId), amount: 9900, status: 'pending' }, // no cuenta
  ]);
  await Sale.create([
    { partnerId, partnerType: 'store', userId: adopterId, amountEur: 100, commissionPct: 5, commissionEur: 5 },
    { partnerId, partnerType: 'store', userId: adopterId, amountEur: 60, commissionPct: 5, commissionEur: 3 },
  ]);
  await Coupon.create([
    { partnerId, partnerType: 'store', title: 'Cupón usado', discount: '10%', copy: 'Descuento', usedAt: new Date(), usedBy: adopterId },
    { partnerId, partnerType: 'store', title: 'Cupón sin usar', discount: '5%', copy: 'Descuento' },
  ]);
  await PatitaTxn.create([
    { type: 'earn', userId: adopterId, amount: 50 },
    { type: 'donate', userId: adopterId, shelterId, amount: 20 },
    { type: 'redeem', shelterId, partnerId, amount: 30, valueEur: 3 },
  ]);
}

describe('KPIs internos de plataforma (admin)', () => {
  it('agrega usuarios, solicitudes, GMV, cupones y Patitas', async () => {
    await seedPlatformData();
    const r = await request(app).get('/api/admin/metrics').set(adminH).expect(200);

    expect(r.body.usuarios.adoptantes).toBe(1);
    expect(r.body.usuarios.protectoras).toBe(1);
    expect(r.body.usuarios.vets).toBe(1);
    expect(r.body.usuarios.tiendas).toBe(1);

    expect(r.body.animales.total).toBe(2);
    expect(r.body.animales.publicados).toBe(1);

    expect(r.body.solicitudes.total).toBe(3);
    expect(r.body.solicitudes.adopcionesTotal).toBe(1);
    // 1 aprobada de 2 cerradas (aprobada + rechazada) → 50 %.
    expect(r.body.solicitudes.conversionPct).toBe(50);
    expect(r.body.solicitudes.diasMediosProceso).toBeCloseTo(5);

    expect(r.body.cupones.usados).toBe(1);

    expect(r.body.gmv.ventasEur).toBeCloseTo(160);
    expect(r.body.gmv.comisionVentasEur).toBeCloseTo(8);
    expect(r.body.gmv.donacionesEur).toBeCloseTo(25);
    expect(r.body.gmv.totalEur).toBeCloseTo(185);

    expect(r.body.patitas.emitidas).toBe(50);
    expect(r.body.patitas.donadas).toBe(20);
    expect(r.body.patitas.canjeadas).toBe(30);
    expect(r.body.patitas.canjeadasEur).toBeCloseTo(3);
  });

  it('exporta CSV con BOM', async () => {
    await seedPlatformData();
    const r = await request(app).get('/api/admin/metrics?format=csv').set(adminH).expect(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text).toContain('GMV total');
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
  });

  it('solo lo puede ver un admin', async () => {
    const r = await request(app).get('/api/admin/metrics').set(tenantH);
    expect([401, 403]).toContain(r.status);
  });
});
