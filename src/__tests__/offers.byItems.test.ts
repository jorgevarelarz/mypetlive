import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

// F5: ofertas segmentadas por items comprados (targetItems contra Sale.items.name).
// Reglas: matching laxo (minúsculas/sin acentos/subcadena); en la caja del partner
// solo cuenta el historial en ESE partner; en /offers/for-me cuenta todo el historial
// del usuario; y NUNCA se evalúan en el pasaporte público (sin usuario).

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
const shelterId = new mongoose.Types.ObjectId().toHexString();
const store2Id = new mongoose.Types.ObjectId().toHexString();
const clientId = new mongoose.Types.ObjectId().toHexString();
const storeH = { 'x-user-id': storeId, 'x-user-role': 'store', 'x-user-verified': 'true' };
const store2H = { 'x-user-id': store2Id, 'x-user-role': 'store', 'x-user-verified': 'true' };
const clientH = { 'x-user-id': clientId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const shelterH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };

// identify exige QR/código que pruebe la presencia del cliente (hardening 18 jul).
async function identifyClient(partnerH: Record<string, string>) {
  const { body } = await request(app).get('/api/patitas/my-code').set(clientH).expect(200);
  return request(app).post('/api/patitas/identify').set(partnerH).send({ userToken: body.token }).expect(200);
}

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: storeId, name: 'Tienda Norte', email: 'store@test.com', passwordHash: 'x', role: 'store' },
    { _id: store2Id, name: 'Tienda Sur', email: 'store2@test.com', passwordHash: 'x', role: 'store' },
    { _id: clientId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant', patitas: 0 },
    { _id: shelterId, name: 'Protectora Lugo', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord' },
  ]);
});

async function sellTo(headers: Record<string, string>, items: Array<{ name: string; qty?: number; priceEur?: number }>) {
  await request(app)
    .post('/api/patitas/sales')
    .set(headers)
    .send({ userId: clientId, amountEur: items.reduce((a, i) => a + (i.priceEur || 10), 0), items })
    .expect(201);
}

const baseCoupon = { partnerId: storeId, partnerType: 'store', discount: '10%', active: true };

describe('Ofertas por items comprados — caja del partner', () => {
  it('el cupón con targetItems solo aparece si el cliente compró esos items en este partner', async () => {
    await Coupon.create([
      { ...baseCoupon, copy: 'Descuento pienso', targetItems: ['pienso'] },
      { ...baseCoupon, copy: 'Sin targeting' },
    ]);

    // Sin compras: solo el cupón sin targeting.
    let res = await identifyClient(storeH);
    expect(res.body.coupons.map((c: any) => c.title)).toEqual(['Sin targeting']);

    // Compra con pienso (acentos y mayúsculas no importan).
    await sellTo(storeH, [{ name: 'PIENSO Cachorro 3kg', qty: 1, priceEur: 30 }]);
    res = await identifyClient(storeH);
    expect(res.body.coupons.map((c: any) => c.title).sort()).toEqual(['Descuento pienso', 'Sin targeting']);
  });

  it('las compras en OTRO partner no desbloquean el cupón (privacidad entre tiendas)', async () => {
    await Coupon.create([{ ...baseCoupon, copy: 'Descuento pienso', targetItems: ['pienso'] }]);
    await sellTo(store2H, [{ name: 'Pienso premium', priceEur: 40 }]);

    const res = await identifyClient(storeH);
    expect(res.body.coupons).toHaveLength(0);
  });

  it('casa sin acentos y por subcadena', async () => {
    await Coupon.create([{ ...baseCoupon, copy: 'Antiparasitarios', targetItems: ['antiparasitário'] }]);
    await sellTo(storeH, [{ name: 'Pack ANTIPARASITARIO perro', priceEur: 15 }]);
    const res = await identifyClient(storeH);
    expect(res.body.coupons.map((c: any) => c.title)).toEqual(['Antiparasitarios']);
  });
});

describe('Ofertas por items comprados — /api/offers/for-me y pasaporte', () => {
  it('el usuario ve en for-me las ofertas que casan con su historial, con los items que las explican', async () => {
    await Coupon.create([
      { ...baseCoupon, copy: 'Oferta arena', targetItems: ['arena'] },
      { ...baseCoupon, copy: 'Oferta collar', targetItems: ['collar'] },
    ]);
    await sellTo(storeH, [{ name: 'Arena aglomerante 10L', priceEur: 12 }]);

    const res = await request(app).get('/api/offers/for-me').set(clientH).expect(200);
    const titles = res.body.items.map((o: any) => o.title);
    expect(titles).toContain('Oferta arena');
    expect(titles).not.toContain('Oferta collar');
    const offer = res.body.items.find((o: any) => o.title === 'Oferta arena');
    expect(offer.byItems).toBe(true);
    expect(offer.matchedItems).toEqual(['Arena aglomerante 10L']);
  });

  it('el pasaporte público nunca evalúa ni muestra ofertas por items', async () => {
    // Cupón por items que además casa por especie: en el pasaporte no debe salir.
    await Coupon.create([
      { ...baseCoupon, copy: 'Solo compradores', targetItems: ['pienso'], targetSpecies: ['cat'] },
      { ...baseCoupon, copy: 'Por especie', targetSpecies: ['cat'] },
    ]);
    const animalRes = await request(app)
      .post('/api/animals')
      .set(shelterH)
      .send({ shelter: shelterId, name: 'Trufa', species: 'gato', sex: 'female', age: '2 años', size: 'small', status: 'publicado' })
      .expect(201);
    const code = animalRes.body.code;
    expect(code).toBeTruthy();

    const res = await request(app).get(`/api/offers/for-animal/${code}`).expect(200);
    const titles = res.body.items.map((o: any) => o.title);
    expect(titles).toContain('Por especie');
    expect(titles).not.toContain('Solo compradores');
  });
});
