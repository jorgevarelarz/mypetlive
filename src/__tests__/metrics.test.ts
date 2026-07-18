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
let PartnerIdentification: any;

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
  PartnerIdentification = (await import('../models/partnerIdentification.model')).PartnerIdentification;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const shelterId = new mongoose.Types.ObjectId();
const partnerId = new mongoose.Types.ObjectId();
const adopterA = new mongoose.Types.ObjectId();
const adopterB = new mongoose.Types.ObjectId();
const protectoraH = { 'x-user-id': shelterId.toHexString(), 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const partnerH = { 'x-user-id': partnerId.toHexString(), 'x-user-role': 'store', 'x-user-verified': 'true' };
const adopterH = { 'x-user-id': adopterA.toHexString(), 'x-user-role': 'tenant', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: shelterId, name: 'Protectora Sur', email: 's@test.com', passwordHash: 'x', role: 'landlord' },
    { _id: partnerId, name: 'Tienda Norte', email: 'p@test.com', passwordHash: 'x', role: 'store' },
    { _id: adopterA, name: 'Ana', email: 'a@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: adopterB, name: 'Bea', email: 'b@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
});

async function seedShelterData() {
  const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);
  const [luna, michi] = await Animal.create([
    { name: 'Luna', species: 'gato', sex: 'female', age: '2 años', size: 'small', shelter: shelterId, createdByRole: 'protectora', status: 'adoptado' },
    { name: 'Michi', species: 'gato', sex: 'male', age: '1 año', size: 'small', shelter: shelterId, createdByRole: 'protectora', status: 'publicado' },
  ]);
  // Aprobada (proceso de 5 días vía timestamps manuales), una rechazada y una abierta.
  await Adoption.collection.insertMany([
    { animalId: String(luna._id), adopterId: String(adopterA), status: 'aprobada', createdAt: daysAgo(6), updatedAt: daysAgo(1) },
    { animalId: String(michi._id), adopterId: String(adopterB), status: 'rechazada', createdAt: daysAgo(4), updatedAt: daysAgo(3) },
    { animalId: String(michi._id), adopterId: String(adopterA), status: 'en_revision', createdAt: daysAgo(2), updatedAt: daysAgo(2) },
  ]);
  await Donation.create([
    { animalId: String(luna._id), userId: String(adopterA), amount: 2500, status: 'completed' },
    { animalId: String(michi._id), userId: String(adopterB), amount: 1000, status: 'completed' },
    { animalId: String(luna._id), userId: String(adopterB), amount: 9900, status: 'pending' }, // no cuenta
  ]);
  await PatitaTxn.create([
    { type: 'donate', userId: adopterA, shelterId, amount: 40 },
    { type: 'donate', userId: adopterB, shelterId, amount: 10 },
    { type: 'redeem', shelterId, partnerId, amount: 30, valueEur: 3 },
  ]);
}

describe('Métricas de protectora', () => {
  it('agrega adopciones, conversión, donaciones y Patitas', async () => {
    await seedShelterData();
    const r = await request(app).get('/api/protectoras/me/metrics').set(protectoraH).expect(200);

    expect(r.body.adopciones.total).toBe(1);
    expect(r.body.adopciones.esteMes).toBe(1);
    expect(r.body.adopciones.solicitudesTotales).toBe(3);
    expect(r.body.adopciones.conversionPct).toBe(50); // 1 aprobada de 2 cerradas
    expect(r.body.adopciones.diasMediosProceso).toBeCloseTo(5, 0);
    expect(r.body.donaciones.totalEur).toBe(35);
    expect(r.body.donaciones.numero).toBe(2);
    expect(r.body.patitas.recibidas).toBe(50);
    expect(r.body.patitas.canjeadas).toBe(30);
    expect(r.body.patitas.canjeadasEur).toBe(3);
  });

  it('exporta CSV con las mismas cifras', async () => {
    await seedShelterData();
    const r = await request(app).get('/api/protectoras/me/metrics?format=csv').set(protectoraH).expect(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text).toContain('"Donaciones (€)";35');
    expect(r.text).toContain('"Adopciones totales";1');
  });

  it('solo protectora o admin', async () => {
    await request(app).get('/api/protectoras/me/metrics').set(adopterH).expect(403);
    await request(app).get('/api/protectoras/me/metrics').set(partnerH).expect(403);
  });
});

describe('Métricas de partner', () => {
  it('agrega cupones, clientes únicos, Patitas y ventas', async () => {
    await Coupon.create([
      { partnerId, partnerType: 'store', copy: 'Descuento pienso', discount: '10%', usedAt: new Date(), usedBy: adopterA },
      { partnerId, partnerType: 'store', copy: 'Juguete gratis', discount: '2x1' }, // sin usar
    ]);
    await Sale.create([
      { partnerId, partnerType: 'store', userId: adopterA, amountEur: 50, commissionPct: 5, commissionEur: 2.5 },
      { partnerId, partnerType: 'store', userId: adopterB, amountEur: 30, commissionPct: 5, commissionEur: 1.5 },
    ]);
    await PartnerIdentification.create([{ partnerId, userId: adopterA }]);
    await PatitaTxn.create([{ type: 'redeem', shelterId, partnerId, amount: 30, valueEur: 3 }]);

    const r = await request(app).get('/api/partners/me/metrics').set(partnerH).expect(200);
    expect(r.body.cupones).toEqual({ total: 2, usados: 1, usadosEsteMes: 1 });
    expect(r.body.clientes.unicos).toBe(2); // Ana (cupón+venta+identificación) y Bea (venta)
    expect(r.body.patitas).toEqual({ recibidas: 30, valorEur: 3 });
    expect(r.body.ventas.numero).toBe(2);
    expect(r.body.ventas.totalEur).toBe(80);
    expect(r.body.ventas.comisionEur).toBe(4);
  });

  it('solo partner o admin', async () => {
    await request(app).get('/api/partners/me/metrics').set(adopterH).expect(403);
    await request(app).get('/api/partners/me/metrics').set(protectoraH).expect(403);
  });
});
