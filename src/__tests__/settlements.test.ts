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
let Sale: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Sale = (await import('../models/sale.model')).Sale;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const storeId = new mongoose.Types.ObjectId().toHexString();
const clientId = new mongoose.Types.ObjectId().toHexString();
const storeH = { 'x-user-id': storeId, 'x-user-role': 'store', 'x-user-verified': 'true' };
const adminH = { 'x-user-id': new mongoose.Types.ObjectId().toHexString(), 'x-user-role': 'admin', 'x-user-verified': 'true' };

function currentPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousPeriod() {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function registerSale(amountEur: number) {
  const res = await request(app)
    .post('/api/patitas/sales')
    .set(storeH)
    .send({ userId: clientId, amountEur })
    .expect(201);
  return res.body.saleId as string;
}

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: storeId, name: 'Tienda Norte', email: 'store@test.com', passwordHash: 'x', role: 'store' },
    { _id: clientId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant', patitas: 0 },
  ]);
});

describe('Extracto mensual de liquidación del partner', () => {
  it('agrupa las ventas del partner por mes con totales y estado pendiente', async () => {
    await registerSale(100);
    await registerSale(50.5);

    const res = await request(app).get('/api/patitas/sales/statements').set(storeH).expect(200);
    expect(res.body.items).toHaveLength(1);
    const st = res.body.items[0];
    expect(st.period).toBe(currentPeriod());
    expect(st.sales).toBe(2);
    expect(st.amountEur).toBeCloseTo(150.5);
    // La comisión se redondea a céntimos por venta: 5.00 + 2.53.
    expect(st.commissionEur).toBeCloseTo(7.53);
    expect(st.status).toBe('pending');
  });

  it('separa meses distintos en renglones distintos', async () => {
    const saleId = await registerSale(100);
    await registerSale(40);
    // Mueve una venta al mes anterior tocando createdAt directamente en Mongo.
    const prev = new Date();
    prev.setUTCMonth(prev.getUTCMonth() - 1, 15);
    await Sale.collection.updateOne({ _id: new mongoose.Types.ObjectId(saleId) }, { $set: { createdAt: prev } });

    const res = await request(app).get('/api/patitas/sales/statements').set(storeH).expect(200);
    expect(res.body.items).toHaveLength(2);
    // Orden descendente: primero el mes actual.
    expect(res.body.items[0].period).toBe(currentPeriod());
    expect(res.body.items[1].period).toBe(previousPeriod());
    expect(res.body.items[1].amountEur).toBeCloseTo(100);
  });

  it('exporta el extracto en CSV', async () => {
    await registerSale(80);
    const res = await request(app).get('/api/patitas/sales/statements?format=csv').set(storeH).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('periodo;ventas;base_eur;comision_eur;estado');
    expect(res.text).toContain(currentPeriod());
  });

  it('un adoptante no puede ver extractos', async () => {
    const tenantH = { 'x-user-id': clientId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
    const res = await request(app).get('/api/patitas/sales/statements').set(tenantH);
    expect([401, 403]).toContain(res.status);
  });
});

describe('Liquidación admin por periodo', () => {
  it('lista el periodo con un renglón por partner y totales', async () => {
    await registerSale(200);
    const res = await request(app)
      .get(`/api/admin/sales/settlements?period=${currentPeriod()}`)
      .set(adminH)
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    const row = res.body.items[0];
    expect(String(row.partnerId)).toBe(storeId);
    expect(row.partnerName).toBe('Tienda Norte');
    expect(row.amountEur).toBeCloseTo(200);
    expect(row.status).toBe('pending');
    expect(res.body.totals.commissionEur).toBeCloseTo(10);
  });

  it('rechaza un periodo mal formado', async () => {
    await request(app).get('/api/admin/sales/settlements?period=julio-2026').set(adminH).expect(400);
  });

  it('invoice marca las ventas pendientes como facturadas con referencia', async () => {
    await registerSale(100);
    await registerSale(60);
    const res = await request(app)
      .post(`/api/admin/sales/settlements/${storeId}/${currentPeriod()}`)
      .set(adminH)
      .send({ action: 'invoice', invoiceRef: 'FAC-2026-001' })
      .expect(200);
    expect(res.body.updated).toBe(2);
    expect(res.body.statement.status).toBe('invoiced');
    expect(res.body.statement.invoiceRef).toBe('FAC-2026-001');

    // El partner ve el cambio en su extracto.
    const mine = await request(app).get('/api/patitas/sales/statements').set(storeH).expect(200);
    expect(mine.body.items[0].status).toBe('invoiced');
  });

  it('pay marca como pagado y repetir es idempotente', async () => {
    await registerSale(100);
    await request(app)
      .post(`/api/admin/sales/settlements/${storeId}/${currentPeriod()}`)
      .set(adminH)
      .send({ action: 'invoice' })
      .expect(200);
    const pay = await request(app)
      .post(`/api/admin/sales/settlements/${storeId}/${currentPeriod()}`)
      .set(adminH)
      .send({ action: 'pay' })
      .expect(200);
    expect(pay.body.updated).toBe(1);
    expect(pay.body.statement.status).toBe('paid');

    const again = await request(app)
      .post(`/api/admin/sales/settlements/${storeId}/${currentPeriod()}`)
      .set(adminH)
      .send({ action: 'pay' })
      .expect(200);
    expect(again.body.updated).toBe(0);
    expect(again.body.statement.status).toBe('paid');
  });

  it('liquidar un mes no toca las ventas de otros meses', async () => {
    const saleId = await registerSale(100);
    await registerSale(40);
    const prev = new Date();
    prev.setUTCMonth(prev.getUTCMonth() - 1, 15);
    await Sale.collection.updateOne({ _id: new mongoose.Types.ObjectId(saleId) }, { $set: { createdAt: prev } });

    await request(app)
      .post(`/api/admin/sales/settlements/${storeId}/${previousPeriod()}`)
      .set(adminH)
      .send({ action: 'pay' })
      .expect(200);

    const mine = await request(app).get('/api/patitas/sales/statements').set(storeH).expect(200);
    const byPeriod: Record<string, any> = Object.fromEntries(mine.body.items.map((r: any) => [r.period, r]));
    expect(byPeriod[previousPeriod()].status).toBe('paid');
    expect(byPeriod[currentPeriod()].status).toBe('pending');
  });

  it('un partner no puede usar los endpoints de liquidación de admin', async () => {
    const res = await request(app)
      .post(`/api/admin/sales/settlements/${storeId}/${currentPeriod()}`)
      .set(storeH)
      .send({ action: 'pay' });
    expect([401, 403]).toContain(res.status);
  });
});
