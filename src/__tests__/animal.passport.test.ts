import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let Coupon: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  delete process.env.STRIPE_SECRET_KEY; // asegura el camino gateado
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
  Coupon = (await import('../models/coupon.model')).Coupon;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const shelterId = new mongoose.Types.ObjectId().toHexString();
const storeId = new mongoose.Types.ObjectId().toHexString();
const adopterId = new mongoose.Types.ObjectId().toHexString();

const shelterH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const storeH = { 'x-user-id': storeId, 'x-user-role': 'store', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: shelterId, name: 'Protectora Lugo', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord', profile: { address: { city: 'Lugo' } } },
    { _id: storeId, name: 'Pet Market', email: 'store@test.com', passwordHash: 'x', role: 'store' },
    { _id: adopterId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
});

async function createAnimal(overrides: Record<string, any> = {}) {
  const res = await request(app)
    .post('/api/animals')
    .set(shelterH)
    .send({ shelter: shelterId, name: 'Milo', species: 'gato', sex: 'male', age: '2 años', size: 'small', status: 'publicado', ...overrides })
    .expect(201);
  return res.body;
}

describe('Pasaporte del animal', () => {
  it('registra el evento "created" y el pasaporte expone la línea de tiempo', async () => {
    const animal = await createAnimal();
    expect(animal.code).toBeTruthy();

    const res = await request(app).get(`/api/animals/passport/${animal.code}`).expect(200);
    expect(res.body.code).toBe(animal.code);
    expect(res.body.name).toBe('Milo');
    expect(Array.isArray(res.body.timeline)).toBe(true);
    expect(res.body.timeline.some((t: any) => t.type === 'created')).toBe(true);
    expect(res.body.provenance?.shelterName).toBe('Protectora Lugo');
  });

  it('el pasaporte público NO filtra datos del dueño', async () => {
    const animal = await createAnimal();
    const res = await request(app).get(`/api/animals/passport/${animal.code}`).expect(200);
    // No debe exponer ownerId/shelter ni el email de la protectora.
    expect(res.body.ownerId).toBeUndefined();
    expect(res.body.shelter).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('shelter@test.com');
    // Solo procedencia redactada (nombre + ciudad).
    expect(res.body.provenance).toEqual({ shelterName: 'Protectora Lugo', city: 'Lugo' });
  });

  it('unifica el vocabulario de especie en el alta (gato→cat, perro→dog)', async () => {
    const gato = await createAnimal({ name: 'Luna', species: 'gato' });
    const perro = await createAnimal({ name: 'Toby', species: 'perro' });
    expect(gato.species).toBe('cat');
    expect(perro.species).toBe('dog');
  });

  it('casa ofertas por especie incluyendo datos legados (perro≡dog)', async () => {
    // Animal legado insertado en crudo (sin pasar por el setter del modelo) con
    // la especie en español, como los datos sembrados antiguos.
    await Animal.collection.insertOne({
      _id: new mongoose.Types.ObjectId(),
      shelter: new mongoose.Types.ObjectId(shelterId),
      name: 'Nina', species: 'perro', sex: 'female', age: '1 año', size: 'medium',
      code: 'NINA-001', status: 'publicado', createdByRole: 'protectora', isPersonalPet: false,
      city: 'Madrid', createdAt: new Date(), updatedAt: new Date(),
    });

    // Cupón dirigido a "dog" (inglés) debe casar al animal "perro" (legado).
    await Coupon.create({ partnerId: storeId, partnerType: 'store', copy: 'Pienso perros -10%', discount: '10%', active: true, targetSpecies: ['dog'] });
    // Cupón dirigido a "cat" NO debe casar.
    await Coupon.create({ partnerId: storeId, partnerType: 'store', copy: 'Arena gatos', discount: '5%', active: true, targetSpecies: ['cat'] });

    const res = await request(app).get('/api/offers/for-animal/NINA-001').expect(200);
    const titles = res.body.items.map((o: any) => o.title);
    expect(titles).toContain('Pienso perros -10%');
    expect(titles).not.toContain('Arena gatos');
  });

  it('placement patrocinado gateado: sin Stripe queda pendiente y no se activa', async () => {
    const coupon = await Coupon.create({ partnerId: storeId, partnerType: 'store', copy: 'Destacar', discount: '15%', active: true });
    const res = await request(app)
      .post(`/api/offers/coupons/${coupon._id}/sponsor`)
      .set(storeH)
      .expect(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.configured).toBe(false);

    const updated = await Coupon.findById(coupon._id).lean();
    expect(updated.sponsored).toBe(false);
    expect(updated.sponsorshipStatus).toBe('pending');
  });

  it('un partner ajeno no puede patrocinar un cupón que no es suyo', async () => {
    const otherStore = new mongoose.Types.ObjectId().toHexString();
    const coupon = await Coupon.create({ partnerId: otherStore, partnerType: 'store', copy: 'X', discount: '1%', active: true });
    await request(app)
      .post(`/api/offers/coupons/${coupon._id}/sponsor`)
      .set(storeH)
      .expect(403);
  });
});
