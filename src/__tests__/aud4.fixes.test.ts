import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { hueco } from './utils/huecos';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendSms: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/push', () => ({ sendPushToUser: jest.fn().mockResolvedValue(undefined) }));

// Arreglos de la auditoría AUD-4 (2 nov 2026) y la regla de Jorge: las Patitas
// las paga el comercio que las reparte, en su comisión (0,10 € + 20 % = 0,12 €).

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let Coupon: any;
let Sale: any;
let PatitaLog: any;
let VetAppointment: any;
let SlotClaim: any;
let signUserToken: (id: string) => string;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  process.env.PET_INVITE_HOURLY_LIMIT = '1000';
  process.env.VET_APPT_HOURLY_LIMIT = '1000';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
  Coupon = (await import('../models/coupon.model')).Coupon;
  Sale = (await import('../models/sale.model')).Sale;
  PatitaLog = (await import('../models/patitaLog.model')).PatitaLog;
  VetAppointment = (await import('../models/vetAppointment.model')).VetAppointment;
  SlotClaim = (await import('../models/slotClaim.model')).SlotClaim;
  signUserToken = (await import('../utils/patitas')).signUserToken;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const id = () => new mongoose.Types.ObjectId().toHexString();
const H = (u: string, role = 'tenant') => ({ 'x-user-id': u, 'x-user-role': role, 'x-user-verified': 'true' });
// Ids nuevos en cada test: algunos límites viven en memoria del proceso.
let clienteId: string; let otroId: string; let tiendaId: string; let tienda2Id: string; let vetId: string;

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) await mongoose.connection.db.dropDatabase();
  [clienteId, otroId, tiendaId, tienda2Id, vetId] = [id(), id(), id(), id(), id()];
  await User.create([
    { _id: clienteId, name: 'Ana', email: `ana${clienteId}@test.com`, passwordHash: 'x', role: 'tenant' },
    { _id: otroId, name: 'Pablo', email: `pablo${otroId}@test.com`, passwordHash: 'x', role: 'tenant' },
    { _id: tiendaId, name: 'Tienda', email: `t${tiendaId}@test.com`, passwordHash: 'x', role: 'store' },
    { _id: tienda2Id, name: 'Tienda 2', email: `t${tienda2Id}@test.com`, passwordHash: 'x', role: 'store' },
    { _id: vetId, name: 'Vet', email: `v${vetId}@test.com`, passwordHash: 'x', role: 'vet' },
  ]);
});

const patitas = async (u: string) => Number((await User.findById(u).lean())?.patitas) || 0;
const cupon = (extra: any = {}) => Coupon.create({ partnerId: tiendaId, partnerType: 'store', copy: 'X', discount: '5%', active: true, bonusPatitas: 50, ...extra });
const usar = (c: any, body: any = {}) => request(app).post(`/api/coupons/${c._id}/use`).set(H(tiendaId, 'store')).send({ userToken: signUserToken(clienteId), ...body });

describe('Modelo de Patitas: comisión fija, la mitad vuelve en Patitas, las extra las paga el comercio', () => {
  it('una compra: comisión fija del 5 % y la mitad vuelve en Patitas', async () => {
    const r = await request(app).post('/api/patitas/sales').set(H(tiendaId, 'store')).send({ userToken: signUserToken(clienteId), amountEur: 20 }).expect(201);
    const sale = await Sale.findById(r.body.saleId).lean();
    expect(sale.commissionEur).toBeCloseTo(1);
    expect(sale.patitasEarned).toBe(5);
    expect(sale.patitasCostEur).toBe(0);
    expect(await patitas(clienteId)).toBe(5);
  });

  it('un cupón suelto deja un cargo con su coste', async () => {
    await usar(await cupon()).expect(200);
    const cargo = await Sale.findOne({ partnerId: tiendaId, kind: 'coupon' }).lean();
    expect(cargo.amountEur).toBe(0);
    expect(cargo.commissionEur).toBeCloseTo(6);
    expect(cargo.couponPatitas).toBe(50);
  });

  it('una visita deja un cargo con su coste', async () => {
    await request(app).post('/api/patitas/earn/visit').set(H(tiendaId, 'store')).send({ userToken: signUserToken(clienteId) }).expect(200);
    const cargo = await Sale.findOne({ partnerId: tiendaId, kind: 'visit' }).lean();
    expect(cargo.commissionEur).toBeGreaterThan(0);
  });

  it('los cupones de una venta suben la comisión de esa venta', async () => {
    const c = await cupon();
    const r = await request(app).post('/api/patitas/sales').set(H(tiendaId, 'store'))
      .send({ userToken: signUserToken(clienteId), amountEur: 10, couponIds: [String(c._id)] }).expect(201);
    const sale = await Sale.findById(r.body.saleId).lean();
    expect(sale.commissionEur).toBeCloseTo(0.5 + 50 * 0.12);
  });
});

describe('FAC-138 · topes de los cupones', () => {
  it('pasado el tope diario por cliente no da más Patitas y el cupón sigue sin usar', async () => {
    const cs = await Promise.all([1, 2, 3, 4, 5].map(() => cupon()));
    for (const c of cs.slice(0, 4)) await usar(c).expect(200); // 200 Patitas
    const r = await usar(cs[4]);
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('coupon_patitas_limit');
    expect(await patitas(clienteId)).toBe(200);
    expect((await Coupon.findById(cs[4]._id).lean()).usedAt).toBeFalsy();
  });

  it('como mucho 10 cupones activos por comercio', async () => {
    const body = { copy: 'Oferta', discount: '5%', bonusPatitas: 10 };
    for (let i = 0; i < 10; i += 1) await request(app).post('/api/coupons/mine').set(H(tiendaId, 'store')).send(body).expect(201);
    const r = await request(app).post('/api/coupons/mine').set(H(tiendaId, 'store')).send(body).expect(409);
    expect(r.body.error).toBe('too_many_active_coupons');
  });
});

describe('FAC-139 · venta de caja con cupones', () => {
  it('con el código del propio comercio y cupones: 400 y sin Patitas', async () => {
    await cupon();
    const r = await request(app).post('/api/patitas/sales').set(H(tiendaId, 'store'))
      .send({ userToken: signUserToken(tiendaId), amountEur: 1, applyCoupons: true });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_beneficiary');
    expect(await patitas(tiendaId)).toBe(0);
  });

  it('un cupón desactivado no se aplica en una venta', async () => {
    const c = await cupon({ active: false });
    const r = await request(app).post('/api/patitas/sales').set(H(tiendaId, 'store'))
      .send({ userToken: signUserToken(clienteId), amountEur: 10, couponIds: [String(c._id)] }).expect(201);
    expect(r.body.appliedCoupons).toHaveLength(0);
  });
});

describe('FAC-141 · logId de otro comercio', () => {
  it('404 y ni el registro ni el cupón cambian', async () => {
    const c = await cupon();
    const log = await PatitaLog.create({ shelterId: otroId, userId: clienteId, partnerId: tienda2Id, amount: 5, source: 'store', concept: 'x' });
    await usar(c, { logId: String(log._id) }).expect(404);
    expect((await PatitaLog.findById(log._id).lean()).couponId).toBeFalsy();
    expect((await Coupon.findById(c._id).lean()).usedAt).toBeFalsy();
  });
});

describe('FAC-140 · permiso del vet con cita confirmada', () => {
  it('confirmada hace 40 días no da permiso; para dentro de 3, sí', async () => {
    const pet = (await request(app).post('/api/animals/personal').set(H(clienteId)).send({ name: 'Luna', species: 'perro', age: '3 años' }).expect(201)).body;
    const c = await VetAppointment.create({ vetId, userId: clienteId, animalId: pet._id, animalCode: pet.code, reason: 'x', status: 'confirmed', requestedAt: new Date(Date.now() - 40 * 86_400_000), scheduledAt: new Date(Date.now() - 40 * 86_400_000) });
    const apuntar = () => request(app).post(`/api/animals/${pet.code}/health`).set(H(vetId, 'vet')).send({ category: 'checkup', note: 'Bien' });
    await apuntar().expect(403);
    await VetAppointment.updateOne({ _id: c._id }, { scheduledAt: new Date(Date.now() + 3 * 86_400_000) });
    await apuntar().expect(201);
  });
});

describe('Bajas', () => {
  it('un hueco con reserva de clave antigua de otra cita da 409', async () => {
    const h = hueco(0);
    await SlotClaim.create({ _id: `${vetId}|${h.toISOString()}`, appointmentId: new mongoose.Types.ObjectId() });
    const r = await request(app).post('/api/vet-appointments').set(H(clienteId)).send({ vetId, reason: 'x', requestedAt: h.toISOString() });
    expect(r.status).toBe(409);
  });

  it('rechazar una invitación ya aceptada da 410; reaceptar tras ser quitado, también', async () => {
    const pet = (await request(app).post('/api/animals/personal').set(H(clienteId)).send({ name: 'Luna', species: 'perro', age: '3 años' }).expect(201)).body;
    const email = (await User.findById(otroId).lean()).email;
    const { token } = (await request(app).post(`/api/animals/${pet._id}/family/invites`).set(H(clienteId)).send({ email }).expect(201)).body;
    await request(app).post('/api/pet-invites/accept').set(H(otroId)).send({ token }).expect(200);
    await request(app).post('/api/pet-invites/decline').set(H(otroId)).send({ token }).expect(410);
    await Animal.updateOne({ _id: pet._id }, { $set: { members: [] } });
    const r = await request(app).post('/api/pet-invites/accept').set(H(otroId)).send({ token }).expect(410);
    expect(r.body.error).toBe('invite_revoked');
  });

  it('el aviso al móvil de una invitación no lleva nombres', async () => {
    const { sendPushToUser } = await import('../utils/push');
    (sendPushToUser as jest.Mock).mockClear();
    const pet = (await request(app).post('/api/animals/personal').set(H(clienteId)).send({ name: 'Lunita', species: 'perro', age: '3 años' }).expect(201)).body;
    const email = (await User.findById(otroId).lean()).email;
    await request(app).post(`/api/animals/${pet._id}/family/invites`).set(H(clienteId)).send({ email }).expect(201);
    const texto = JSON.stringify((sendPushToUser as jest.Mock).mock.calls);
    expect(texto).not.toContain('Lunita');
    expect(texto).not.toContain('Ana');
  });
});
