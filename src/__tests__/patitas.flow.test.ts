import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Coupon: any;
let Verification: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  process.env.PATITA_VALUE_EUR = '0.10';
  process.env.VISIT_PATITAS_REWARD = '5';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Coupon = (await import('../models/coupon.model')).Coupon;
  Verification = (await import('../models/verification.model')).Verification;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const tenantId = new mongoose.Types.ObjectId().toHexString();
const shelterId = new mongoose.Types.ObjectId().toHexString();
const storeId = new mongoose.Types.ObjectId().toHexString();

const tenantH = { 'x-user-id': tenantId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const shelterH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const storeH = { 'x-user-id': storeId, 'x-user-role': 'store', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: tenantId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: shelterId, name: 'Protectora Lugo', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord' },
    { _id: storeId, name: 'Tienda Mascotas', email: 'store@test.com', passwordHash: 'x', role: 'store' },
  ]);
  // Recibir donaciones exige protectora verificada como entidad de protección.
  await Verification.create({
    userId: shelterId,
    status: 'verified',
    verificationLevel: 'animal_protection_entity',
  });
});

async function balance(id: string): Promise<number> {
  const u = await User.findById(id).select('patitas').lean();
  return (u?.patitas as number) || 0;
}

describe('Flujo de Patitas (moneda de impacto)', () => {
  it('genera Patitas al usuario por cupón (bonusPatitas)', async () => {
    const coupon = await Coupon.create({
      partnerId: storeId, partnerType: 'store', copy: 'Pienso -20%', discount: '20%', active: true, bonusPatitas: 30,
    });
    const res = await request(app)
      .post(`/api/coupons/${coupon._id}/use`)
      .set(storeH)
      .send({ userId: tenantId })
      .expect(200);
    expect(res.body.earn.earned).toBe(30);
    expect(await balance(tenantId)).toBe(30);
  });

  it('genera Patitas por visita y respeta el rate-limit', async () => {
    const first = await request(app).post('/api/patitas/earn/visit').set(storeH).send({ userId: tenantId }).expect(200);
    expect(first.body.earned).toBe(5);
    expect(await balance(tenantId)).toBe(5);
    // segunda visita inmediata: bloqueada
    await request(app).post('/api/patitas/earn/visit').set(storeH).send({ userId: tenantId }).expect(429);
  });

  it('el usuario dona Patitas a la protectora', async () => {
    await User.findByIdAndUpdate(tenantId, { patitas: 40 });
    const res = await request(app).post('/api/patitas/donate').set(tenantH).send({ shelterId, amount: 25 }).expect(200);
    expect(res.body.balance).toBe(15);
    expect(await balance(tenantId)).toBe(15);
    expect(await balance(shelterId)).toBe(25);
  });

  it('rechaza donar más Patitas de las disponibles', async () => {
    await User.findByIdAndUpdate(tenantId, { patitas: 5 });
    const res = await request(app).post('/api/patitas/donate').set(tenantH).send({ shelterId, amount: 50 }).expect(400);
    expect(res.body.error).toBe('insufficient_patitas');
  });

  it('auto-donación: las Patitas generadas se reenvían a la protectora', async () => {
    await request(app).patch(`/api/users/${tenantId}`).set(tenantH).send({ profile: { autoDonate: { enabled: true, shelterId } } }).expect(200);
    const coupon = await Coupon.create({ partnerId: storeId, partnerType: 'store', copy: 'Premios', discount: '10%', active: true, bonusPatitas: 12 });
    const res = await request(app).post(`/api/coupons/${coupon._id}/use`).set(storeH).send({ userId: tenantId }).expect(200);
    expect(res.body.earn.autoDonated).toBe(true);
    expect(await balance(tenantId)).toBe(0);
    expect(await balance(shelterId)).toBe(12);
  });

  it('canje: la protectora genera wallet y el partner canjea (pago gateado)', async () => {
    await User.findByIdAndUpdate(shelterId, { patitas: 100 });
    const wallet = await request(app).get('/api/patitas/wallet/token').set(shelterH).expect(200);
    expect(wallet.body.token).toBeTruthy();
    expect(wallet.body.code).toBeTruthy();

    const confirm = await request(app)
      .post('/api/patitas/redeem/confirm')
      .set(storeH)
      .send({ walletToken: wallet.body.token, amount: 40 })
      .expect(200);
    expect(confirm.body.code).toMatch(/^MPL-/);
    expect(confirm.body.patitas).toBe(40);
    expect(confirm.body.valueEur).toBeCloseTo(4.0);
    expect(confirm.body.payoutStatus).toBe('pending_payout'); // sin Stripe configurado
    expect(await balance(shelterId)).toBe(60);
  });

  it('canje rechaza importe mayor que el saldo', async () => {
    await User.findByIdAndUpdate(shelterId, { patitas: 10 });
    const wallet = await request(app).get('/api/patitas/wallet/token').set(shelterH).expect(200);
    const res = await request(app)
      .post('/api/patitas/redeem/confirm')
      .set(storeH)
      .send({ walletToken: wallet.body.token, amount: 50 })
      .expect(400);
    expect(res.body.error).toBe('insufficient_patitas');
  });

  it('RBAC: un tenant no puede canjear y un store no puede donar', async () => {
    const wallet = await request(app).get('/api/patitas/wallet/token').set(shelterH).expect(200);
    await request(app).post('/api/patitas/redeem/confirm').set(tenantH).send({ walletToken: wallet.body.token, amount: 1 }).expect(403);
    await request(app).post('/api/patitas/donate').set(storeH).send({ shelterId, amount: 1 }).expect(403);
  });
});
