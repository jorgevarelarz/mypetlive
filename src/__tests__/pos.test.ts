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
let Animal: any;
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
  Coupon = (await import('../models/coupon.model')).Coupon;
  Animal = (await import('../models/animal.model')).Animal;
  Sale = (await import('../models/sale.model')).Sale;
  PartnerIdentification = (await import('../models/partnerIdentification.model')).PartnerIdentification;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const storeId = new mongoose.Types.ObjectId().toHexString();
const otherStoreId = new mongoose.Types.ObjectId().toHexString();
const clientId = new mongoose.Types.ObjectId().toHexString();
const storeH = { 'x-user-id': storeId, 'x-user-role': 'store', 'x-user-verified': 'true' };
const clientH = { 'x-user-id': clientId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

async function getPosKey(): Promise<string> {
  const res = await request(app).post('/api/partners/me/pos-key').set(storeH).expect(200);
  expect(res.body.key).toMatch(/^mpl_pos_/);
  return res.body.key;
}

async function createPosKey(label?: string, mode?: 'live' | 'test') {
  const res = await request(app).post('/api/partners/me/pos-keys').set(storeH).send({ label, mode }).expect(201);
  return res.body as { key: string; id: string; label: string; mode: string; prefix: string };
}

// El cliente muestra su QR/código en caja: el TPV solo identifica con esta prueba
// de presencia (userToken firmado o código corto), nunca con un userId crudo.
async function getClientCode(): Promise<{ token: string; code: string }> {
  const res = await request(app).get('/api/patitas/my-code').set(clientH).expect(200);
  return res.body;
}

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: storeId, name: 'Tienda Norte', email: 'store@test.com', passwordHash: 'x', role: 'store' },
    { _id: otherStoreId, name: 'Tienda Sur', email: 'store2@test.com', passwordHash: 'x', role: 'store' },
    { _id: clientId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant', patitas: 0 },
  ]);
});

describe('API POS del partner', () => {
  it('gestiona la clave legado: estado, generación única y rotación que invalida la anterior', async () => {
    const st0 = await request(app).get('/api/partners/me/pos-key').set(storeH).expect(200);
    expect(st0.body.configured).toBe(false);

    const key1 = await getPosKey();
    const st1 = await request(app).get('/api/partners/me/pos-key').set(storeH).expect(200);
    expect(st1.body.configured).toBe(true);
    expect(key1.startsWith(st1.body.prefix)).toBe(true);

    // La clave funciona; tras rotar, la vieja deja de valer.
    const { code } = await getClientCode();
    await request(app).post('/api/pos/identify').set('X-Api-Key', key1).send({ code }).expect(200);
    const key2 = await getPosKey();
    await request(app).post('/api/pos/identify').set('X-Api-Key', key1).send({ code }).expect(401);
    await request(app).post('/api/pos/identify').set('X-Api-Key', key2).send({ code }).expect(200);
    await request(app).post('/api/pos/identify').set('X-Api-Key', 'mpl_pos_invalidainvalidainvalidainvalida').send({ code }).expect(401);
  });

  it('multi-clave: varias cajas con etiqueta, listado y revocación individual', async () => {
    const caja1 = await createPosKey('Caja 1');
    const caja2 = await createPosKey('Caja 2');
    expect(caja1.key).toMatch(/^mpl_pos_/);
    expect(caja1.mode).toBe('live');

    const list = await request(app).get('/api/partners/me/pos-keys').set(storeH).expect(200);
    expect(list.body.keys.map((k: any) => k.label).sort()).toEqual(['Caja 1', 'Caja 2']);

    const { code } = await getClientCode();
    await request(app).post('/api/pos/identify').set('X-Api-Key', caja1.key).send({ code }).expect(200);
    await request(app).post('/api/pos/identify').set('X-Api-Key', caja2.key).send({ code }).expect(200);

    // Revocar la Caja 1 no afecta a la Caja 2.
    await request(app).delete(`/api/partners/me/pos-keys/${caja1.id}`).set(storeH).expect(200);
    await request(app).post('/api/pos/identify').set('X-Api-Key', caja1.key).send({ code }).expect(401);
    await request(app).post('/api/pos/identify').set('X-Api-Key', caja2.key).send({ code }).expect(200);
  });

  it('el TPV exige QR o código: un userId crudo se rechaza', async () => {
    const key = await getPosKey();
    await request(app).post('/api/pos/identify').set('X-Api-Key', key).send({ userId: clientId }).expect(400);
    await request(app).post('/api/pos/sales').set('X-Api-Key', key).send({ userId: clientId, amountEur: 10 }).expect(400);
    // El userToken firmado del QR sí vale.
    const { token } = await getClientCode();
    await request(app).post('/api/pos/identify').set('X-Api-Key', key).send({ userToken: token }).expect(200);
  });

  it('identify devuelve el cliente y solo sus cupones elegibles en este establecimiento', async () => {
    const key = await getPosKey();
    await Animal.create({
      name: 'Luna', species: 'cat', code: 'LUNA01', age: '2 años', ownerId: clientId,
      shelter: otherStoreId, createdByRole: 'tenant', status: 'adoptado', isPersonalPet: true,
    });
    await Coupon.create([
      { partnerId: storeId, partnerType: 'store', copy: '10% en pienso', discount: '-10%', bonusPatitas: 20, active: true },
      { partnerId: storeId, partnerType: 'store', copy: 'Solo para Luna', discount: '-5%', active: true, targetAnimalCode: 'LUNA01' },
      { partnerId: storeId, partnerType: 'store', copy: 'De otra mascota', discount: '-5%', active: true, targetAnimalCode: 'OTRO99' },
      { partnerId: storeId, partnerType: 'store', copy: 'Caducado', discount: '-5%', active: true, expiresAt: new Date(Date.now() - 1000) },
      { partnerId: otherStoreId, partnerType: 'store', copy: 'De otra tienda', discount: '-5%', active: true },
    ]);

    const { code } = await getClientCode();
    const res = await request(app).post('/api/pos/identify').set('X-Api-Key', key).send({ code }).expect(200);
    expect(res.body.name).toBe('Ana');
    const titles = res.body.coupons.map((c: any) => c.title).sort();
    expect(titles).toEqual(['10% en pienso', 'Solo para Luna']);
  });

  it('sales exporta la venta con productos, aplica cupones automáticamente y suma Patitas', async () => {
    const key = await getPosKey();
    const coupon = await Coupon.create({ partnerId: storeId, partnerType: 'store', copy: '10% en pienso', discount: '-10%', bonusPatitas: 20, active: true });

    const { code } = await getClientCode();
    const res = await request(app)
      .post('/api/pos/sales')
      .set('X-Api-Key', key)
      .send({ code, applyCoupons: true, amountEur: 47.5, items: [{ name: 'Pienso cachorro 3kg', qty: 1, priceEur: 32.5 }] })
      .expect(201);

    expect(res.body.commissionEur).toBeCloseTo(2.38, 2);
    expect(res.body.appliedCoupons).toHaveLength(1);
    expect(res.body.patitasEarned).toBe(47 + 20); // 1/€ + bonus del cupón

    const ana: any = await User.findById(clientId).select('patitas').lean();
    expect(ana.patitas).toBe(67);

    // El cupón queda consumido: la siguiente venta ya no lo aplica.
    const again: any = await Coupon.findById(coupon._id).lean();
    expect(again.usedAt).toBeTruthy();
    const res2 = await request(app).post('/api/pos/sales').set('X-Api-Key', key).send({ code, applyCoupons: true, amountEur: 10 }).expect(201);
    expect(res2.body.appliedCoupons).toHaveLength(0);
  });

  it('sales respeta couponIds explícitos y applyCoupons:false', async () => {
    const key = await getPosKey();
    const [c1] = await Coupon.create([
      { partnerId: storeId, partnerType: 'store', copy: 'Cupón A', discount: '-10%', bonusPatitas: 10, active: true },
      { partnerId: storeId, partnerType: 'store', copy: 'Cupón B', discount: '-20%', bonusPatitas: 10, active: true },
    ]);

    const { code } = await getClientCode();
    const off = await request(app).post('/api/pos/sales').set('X-Api-Key', key).send({ code, amountEur: 10, applyCoupons: false }).expect(201);
    expect(off.body.appliedCoupons).toHaveLength(0);

    const explicit = await request(app).post('/api/pos/sales').set('X-Api-Key', key).send({ code, amountEur: 10, couponIds: [String(c1._id)] }).expect(201);
    expect(explicit.body.appliedCoupons).toHaveLength(1);
    expect(explicit.body.appliedCoupons[0].title).toBe('Cupón A');
  });

  it('el reintento con el mismo externalRef devuelve la misma respuesta, cupones incluidos', async () => {
    const key = await getPosKey();
    await Coupon.create({ partnerId: storeId, partnerType: 'store', copy: 'Bono', discount: '-10%', bonusPatitas: 15, active: true });

    const { code } = await getClientCode();
    const body = { code, amountEur: 20, applyCoupons: true, externalRef: 'TICKET-001' };
    const first = await request(app).post('/api/pos/sales').set('X-Api-Key', key).send(body).expect(201);
    expect(first.body.appliedCoupons).toHaveLength(1);
    expect(first.body.patitasEarned).toBe(20 + 15);

    // Reintento (p. ej. timeout de red): misma venta, mismo ticket imprimible.
    const retry = await request(app).post('/api/pos/sales').set('X-Api-Key', key).send(body).expect(200);
    expect(retry.body.duplicate).toBe(true);
    expect(retry.body.saleId).toBe(first.body.saleId);
    expect(retry.body.patitasEarned).toBe(first.body.patitasEarned);
    expect(retry.body.appliedCoupons).toHaveLength(1);
    expect(retry.body.appliedCoupons[0].title).toBe('Bono');

    expect(await Sale.countDocuments({})).toBe(1);
    const ana: any = await User.findById(clientId).select('patitas').lean();
    expect(ana.patitas).toBe(35); // el reintento no duplica Patitas
  });

  it('dos reintentos concurrentes con el mismo externalRef crean una sola venta', async () => {
    const key = await getPosKey();
    // dropDatabase borra los índices: reconstruir el único (partnerId, externalRef)
    // que arbitra la carrera.
    await Sale.syncIndexes();

    const { code } = await getClientCode();
    const body = { code, amountEur: 30, externalRef: 'TICKET-RACE' };
    const [a, b] = await Promise.all([
      request(app).post('/api/pos/sales').set('X-Api-Key', key).send(body),
      request(app).post('/api/pos/sales').set('X-Api-Key', key).send(body),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 201].sort());
    expect(a.body.saleId).toBe(b.body.saleId);
    expect(await Sale.countDocuments({})).toBe(1);
    const ana: any = await User.findById(clientId).select('patitas').lean();
    expect(ana.patitas).toBe(30);
  });

  it('dos cajas concurrentes no pueden consumir el mismo cupón dos veces', async () => {
    const key = await getPosKey();
    const c = await Coupon.create({ partnerId: storeId, partnerType: 'store', copy: 'Único', discount: '-10%', bonusPatitas: 20, active: true });

    const { code } = await getClientCode();
    const send = () => request(app).post('/api/pos/sales').set('X-Api-Key', key)
      .send({ code, amountEur: 10, couponIds: [String(c._id)] });
    const [a, b] = await Promise.all([send(), send()]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const totalApplied = a.body.appliedCoupons.length + b.body.appliedCoupons.length;
    expect(totalApplied).toBe(1);

    // Base 10+10, bonus 20 una sola vez.
    const ana: any = await User.findById(clientId).select('patitas').lean();
    expect(ana.patitas).toBe(40);
  });

  it('la clave de test (sandbox) valida y simula sin persistir nada', async () => {
    const testKey = await createPosKey('Integración', 'test');
    expect(testKey.key).toMatch(/^mpl_pos_test_/);
    expect(testKey.mode).toBe('test');
    const coupon = await Coupon.create({ partnerId: storeId, partnerType: 'store', copy: 'Bono', discount: '-10%', bonusPatitas: 20, active: true });

    const { code } = await getClientCode();
    const idr = await request(app).post('/api/pos/identify').set('X-Api-Key', testKey.key).send({ code }).expect(200);
    expect(idr.body.test).toBe(true);
    expect(idr.body.name).toBe('Ana');

    const sale = await request(app)
      .post('/api/pos/sales')
      .set('X-Api-Key', testKey.key)
      .send({ code, amountEur: 50, applyCoupons: true, externalRef: 'TEST-1' })
      .expect(201);
    expect(sale.body.test).toBe(true);
    expect(sale.body.saleId).toBeNull();
    expect(sale.body.patitasEarned).toBe(50 + 20);
    expect(sale.body.appliedCoupons).toHaveLength(1);

    // Cero efectos: ni venta, ni identificación, ni cupón consumido, ni Patitas.
    expect(await Sale.countDocuments({})).toBe(0);
    expect(await PartnerIdentification.countDocuments({})).toBe(0);
    const stillFresh: any = await Coupon.findById(coupon._id).lean();
    expect(stillFresh.usedAt).toBeUndefined();
    const ana: any = await User.findById(clientId).select('patitas').lean();
    expect(ana.patitas).toBe(0);
  });
});
