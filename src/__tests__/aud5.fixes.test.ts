import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { startMongoMemoryReplicaSet } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendSms: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/push', () => ({ sendPushToUser: jest.fn().mockResolvedValue(undefined) }));

// Arreglos de la auditoría AUD-5 (3 nov 2026). Con réplica: los topes se
// serializan con transacciones, que en Mongo sin réplica no existen.

let app: any;
let rs: MongoMemoryReplSet | undefined;
let User: any;
let Coupon: any;
let Sale: any;
let signUserToken: (id: string) => string;

beforeAll(async () => {
  rs = await startMongoMemoryReplicaSet();
  process.env.MONGO_URL = rs.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Coupon = (await import('../models/coupon.model')).Coupon;
  Sale = (await import('../models/sale.model')).Sale;
  signUserToken = (await import('../utils/patitas')).signUserToken;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (rs) await rs.stop();
});

const id = () => new mongoose.Types.ObjectId().toHexString();
const H = (u: string, role = 'tenant') => ({ 'x-user-id': u, 'x-user-role': role, 'x-user-verified': 'true' });
let clienteId: string; let tiendaId: string;

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) await mongoose.connection.db.dropDatabase();
  [clienteId, tiendaId] = [id(), id()];
  await User.create([
    { _id: clienteId, name: 'Ana', email: `a${clienteId}@t.com`, passwordHash: 'x', role: 'tenant' },
    { _id: tiendaId, name: 'Tienda', email: `t${tiendaId}@t.com`, passwordHash: 'x', role: 'store' },
  ]);
});

const patitas = async (u: string) => Number((await User.findById(u).lean())?.patitas) || 0;
const cupon = (extra: any = {}) => Coupon.create({ partnerId: tiendaId, partnerType: 'store', copy: 'X', discount: '5%', active: true, bonusPatitas: 150, ...extra });

describe('FAC-157 · topes de Patitas con peticiones a la vez', () => {
  it('dos cupones que solo caben de uno en uno: uno acredita, el otro no', async () => {
    const [a, b] = await Promise.all([cupon(), cupon()]); // 150 + 150 > 200 al día
    const t = signUserToken(clienteId);
    const rs2 = await Promise.all([a, b].map(c => request(app).post(`/api/coupons/${c._id}/use`).set(H(tiendaId, 'store')).send({ userToken: t })));
    expect(rs2.map(r => r.status).sort()).toEqual([200, 429]);
    expect(await patitas(clienteId)).toBe(150);
  });
});

describe('FAC-156 · tope de cupones activos', () => {
  it('alargar uno caducado con 10 vigentes da 409; con hueco, se puede', async () => {
    for (let i = 0; i < 10; i += 1) await cupon({ bonusPatitas: 10 });
    const viejo = await cupon({ expiresAt: new Date(Date.now() - 86_400_000) });
    const futuro = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const r = await request(app).patch(`/api/coupons/mine/${viejo._id}`).set(H(tiendaId, 'store')).send({ expiresAt: futuro });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('too_many_active_coupons');
    await Coupon.updateOne({ partnerId: tiendaId, _id: { $ne: viejo._id } }, { active: false });
    await request(app).patch(`/api/coupons/mine/${viejo._id}`).set(H(tiendaId, 'store')).send({ expiresAt: futuro }).expect(200);
  });

  it('altas a la vez no pasan del tope', async () => {
    for (let i = 0; i < 9; i += 1) await cupon({ bonusPatitas: 10 });
    const body = { copy: 'Oferta', discount: '5%', bonusPatitas: 10 };
    const r = await Promise.all([1, 2, 3].map(() => request(app).post('/api/coupons/mine').set(H(tiendaId, 'store')).send(body)));
    expect(r.filter(x => x.status === 201)).toHaveLength(1);
    expect(await Coupon.countDocuments({ partnerId: tiendaId, active: true })).toBe(10);
  });
});

describe('FAC-152 · cupones que no caben en una venta', () => {
  it('201 con skippedCoupons y el cupón sigue sin usar', async () => {
    const a = await cupon();
    const b = await cupon();
    const r = await request(app).post('/api/patitas/sales').set(H(tiendaId, 'store'))
      .send({ userToken: signUserToken(clienteId), amountEur: 10, couponIds: [String(a._id), String(b._id)] }).expect(201);
    expect(r.body.appliedCoupons).toHaveLength(1);
    expect(r.body.skippedCoupons).toHaveLength(1);
    expect(r.body.skippedCoupons[0].reason).toBe('coupon_patitas_limit');
    const saltado = r.body.skippedCoupons[0].couponId;
    expect((await Coupon.findById(saltado).lean()).usedAt).toBeFalsy();
  });
});

describe('FAC-153 · el extracto separa compras de cargos', () => {
  it('1 compra y 2 visitas: ventas 1, visitas 2 y la comisión total', async () => {
    const t = signUserToken(clienteId);
    await request(app).post('/api/patitas/sales').set(H(tiendaId, 'store')).send({ userToken: t, amountEur: 20 }).expect(201);
    await request(app).post('/api/patitas/earn/visit').set(H(tiendaId, 'store')).send({ userToken: t }).expect(200);
    await Sale.create({ partnerId: tiendaId, partnerType: 'store', userId: clienteId, kind: 'visit', amountEur: 0, commissionPct: 0, commissionEur: 0.6, patitasCostEur: 0.6 });
    const st = (await request(app).get('/api/patitas/sales/statements').set(H(tiendaId, 'store')).expect(200)).body.items[0];
    expect(st.sales).toBe(1);
    expect(st.visitCharges).toBe(2);
    expect(st.patitasCostEur).toBeCloseTo(1.2);
    expect(st.commissionEur).toBeCloseTo(1 + 1.2);
    const mias = (await request(app).get('/api/patitas/sales/mine').set(H(tiendaId, 'store')).expect(200)).body;
    expect(mias.items).toHaveLength(1);
  });
});

describe('FAC-150 · la caja ve lo que da y lo que cuesta', () => {
  it('un cupón sin bonus sale con la recompensa por defecto y su coste; identify trae la tarifa', async () => {
    await cupon({ bonusPatitas: 0 });
    const r = await request(app).post('/api/patitas/identify').set(H(tiendaId, 'store')).send({ userToken: signUserToken(clienteId) }).expect(200);
    expect(r.body.coupons[0].rewardPatitas).toBe(20);
    expect(r.body.coupons[0].costEur).toBeCloseTo(2.4);
    expect(r.body.tarifa.visita.costEur).toBeCloseTo(0.6);
  });
});
