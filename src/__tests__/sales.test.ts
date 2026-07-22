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
let Coupon: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Coupon = (await import('../models/coupon.model')).Coupon;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const storeId = new mongoose.Types.ObjectId().toHexString();
const clientId = new mongoose.Types.ObjectId().toHexString();
const client2Id = new mongoose.Types.ObjectId().toHexString();
const storeH = { 'x-user-id': storeId, 'x-user-role': 'store', 'x-user-verified': 'true' };
const clientH = { 'x-user-id': clientId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const adminH = { 'x-user-id': new mongoose.Types.ObjectId().toHexString(), 'x-user-role': 'admin', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: storeId, name: 'Tienda Norte', email: 'store@test.com', passwordHash: 'x', role: 'store' },
    { _id: clientId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant', patitas: 0 },
    { _id: client2Id, name: 'Luis', email: 'luis@test.com', passwordHash: 'x', role: 'tenant', patitas: 0 },
  ]);
});

describe('Ventas de partner con comisión', () => {
  it('registra la venta con ticket, calcula la comisión y da Patitas proporcionales', async () => {
    const res = await request(app)
      .post('/api/patitas/sales')
      .set(storeH)
      .send({
        userId: clientId,
        amountEur: 47.5,
        items: [
          { name: 'Pienso cachorro 3kg', qty: 1, priceEur: 32.5 },
          { name: 'Juguete mordedor', qty: 2, priceEur: 7.5 },
        ],
      })
      .expect(201);

    expect(res.body.commissionPct).toBe(5); // default de plataforma
    expect(res.body.commissionEur).toBeCloseTo(2.38, 2); // 5% de 47,50 redondeado a céntimos
    expect(res.body.patitasEarned).toBe(47); // 1 Patita por €, floor

    const ana: any = await User.findById(clientId).select('patitas').lean();
    expect(ana.patitas).toBe(47);
  });

  it('usa el % de comisión del partner si lo tiene configurado', async () => {
    await User.updateOne({ _id: storeId }, { $set: { 'profile.commissionPct': 10 } });
    const res = await request(app)
      .post('/api/patitas/sales')
      .set(storeH)
      .send({ userId: clientId, amountEur: 100 })
      .expect(201);
    expect(res.body.commissionPct).toBe(10);
    expect(res.body.commissionEur).toBeCloseTo(10, 2);
  });

  it('rechaza importes inválidos y a quien no es partner', async () => {
    await request(app).post('/api/patitas/sales').set(storeH).send({ userId: clientId, amountEur: -5 }).expect(400);
    await request(app).post('/api/patitas/sales').set(storeH).send({ userId: clientId }).expect(400);
    await request(app).post('/api/patitas/sales').set(clientH).send({ userId: clientId, amountEur: 10 }).expect(403);
  });

  it('el partner ve sus ventas con totales y el admin los informes', async () => {
    await request(app).post('/api/patitas/sales').set(storeH).send({ userId: clientId, amountEur: 20 }).expect(201);
    await request(app).post('/api/patitas/sales').set(storeH).send({ userId: client2Id, amountEur: 30 }).expect(201);

    const mine = await request(app).get('/api/patitas/sales/mine').set(storeH).expect(200);
    expect(mine.body.totals.count).toBe(2);
    expect(mine.body.totals.amountEur).toBeCloseTo(50, 2);
    expect(mine.body.totals.commissionEur).toBeCloseTo(2.5, 2);

    const admin = await request(app).get('/api/admin/sales').set(adminH).expect(200);
    expect(admin.body.items).toHaveLength(2);
    expect(admin.body.byPartner).toHaveLength(1);
    expect(admin.body.byPartner[0].partnerName).toBe('Tienda Norte');
    expect(admin.body.byPartner[0].commissionEur).toBeCloseTo(2.5, 2);

    const byUser = await request(app).get('/api/admin/sales/by-user').set(adminH).expect(200);
    expect(byUser.body.items).toHaveLength(2);

    // Las rutas admin no son accesibles para el partner.
    await request(app).get('/api/admin/sales').set(storeH).expect(403);
  });

  it('informe de fugas: identificación sin venta cuenta como no declarada', async () => {
    // Dos clientes identificados con su código de presencia (QR/código), solo
    // uno acaba en venta. identify ya no acepta un userId arbitrario.
    const code1 = (await request(app).get('/api/patitas/my-code').set(clientH).expect(200)).body.code;
    const code2 = (await request(app).get('/api/patitas/my-code').set({ 'x-user-id': client2Id, 'x-user-role': 'tenant', 'x-user-verified': 'true' }).expect(200)).body.code;
    await request(app).post('/api/patitas/identify').set(storeH).send({ code: code1 }).expect(200);
    await request(app).post('/api/patitas/identify').set(storeH).send({ code: code2 }).expect(200);
    await request(app).post('/api/patitas/sales').set(storeH).send({ userId: clientId, amountEur: 25 }).expect(201);

    const leaks = await request(app).get('/api/admin/sales/leaks').set(adminH).expect(200);
    expect(leaks.body.items).toHaveLength(1);
    const row = leaks.body.items[0];
    expect(row.identifications).toBe(2);
    expect(row.withSale).toBe(1);
    expect(row.withoutSale).toBe(1);
    expect(row.declaredRatio).toBeCloseTo(0.5, 2);
  });
});

describe('Cupones aplicados junto con la venta (Caja propia)', () => {
  it('couponIds consume el cupón, suma sus Patitas de bonus y lo marca usado', async () => {
    const coupon = await Coupon.create({
      partnerId: storeId, partnerType: 'store', copy: '10% en pienso', discount: '-10%', bonusPatitas: 20, active: true,
    });

    const res = await request(app)
      .post('/api/patitas/sales')
      .set(storeH)
      .send({ userId: clientId, amountEur: 47.5, couponIds: [String(coupon._id)] })
      .expect(201);

    expect(res.body.appliedCoupons).toHaveLength(1);
    expect(res.body.appliedCoupons[0].title).toBe('10% en pienso');
    // Patitas de la venta (floor(47.5)=47) + bonus del cupón (20).
    expect(res.body.patitasEarned).toBe(67);

    const used = await Coupon.findById(coupon._id).lean();
    expect(used.usedAt).toBeTruthy();
    expect(String(used.usedBy)).toBe(storeId);
  });

  it('applyCoupons:true aplica todos los elegibles; sin flags no aplica ninguno', async () => {
    await Coupon.create([
      { partnerId: storeId, partnerType: 'store', copy: 'Bono A', discount: '-5%', active: true },
      { partnerId: storeId, partnerType: 'store', copy: 'Bono B', discount: '-5%', active: true },
    ]);

    const off = await request(app).post('/api/patitas/sales').set(storeH).send({ userId: clientId, amountEur: 10 }).expect(201);
    expect(off.body.appliedCoupons).toHaveLength(0);

    const on = await request(app).post('/api/patitas/sales').set(storeH).send({ userId: clientId, amountEur: 10, applyCoupons: true }).expect(201);
    expect(on.body.appliedCoupons).toHaveLength(2);
  });

  it('un cupón de otro partner no se puede colar por couponIds', async () => {
    const otherStoreId = new mongoose.Types.ObjectId().toHexString();
    await User.create({ _id: otherStoreId, name: 'Otra tienda', email: 'otra@test.com', passwordHash: 'x', role: 'store' });
    const foreign = await Coupon.create({ partnerId: otherStoreId, partnerType: 'store', copy: 'Ajeno', discount: '-5%', active: true });

    const res = await request(app)
      .post('/api/patitas/sales')
      .set(storeH)
      .send({ userId: clientId, amountEur: 10, couponIds: [String(foreign._id)] })
      .expect(201);

    expect(res.body.appliedCoupons).toHaveLength(0);
    const untouched = await Coupon.findById(foreign._id).lean();
    expect(untouched.usedAt).toBeFalsy();
  });
});
