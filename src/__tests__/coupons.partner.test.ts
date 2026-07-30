import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

let app: any;
let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
});

const storeId = new mongoose.Types.ObjectId().toHexString();
const otherStoreId = new mongoose.Types.ObjectId().toHexString();

const headersFor = (id: string, role = 'store') => ({
  'x-user-id': id,
  'x-user-role': role,
  'x-user-verified': 'true',
});

const store = headersFor(storeId);
const otherStore = headersFor(otherStoreId);

const validCoupon = {
  title: 'Primera consulta',
  description: 'Para adoptantes recientes',
  discount: '-15% en la primera compra',
  bonusPatitas: 30,
};

describe('Cupones: autoservicio del partner', () => {
  it('crea un cupón a su propio nombre y lo lista', async () => {
    const created = await request(app)
      .post('/api/coupons/mine')
      .set(store)
      .send(validCoupon)
      .expect(201);

    expect(created.body.partnerId).toBe(storeId);
    expect(created.body.partnerType).toBe('store');
    expect(created.body.bonusPatitas).toBe(30);
    expect(created.body.active).toBe(true);

    const mine = await request(app).get('/api/coupons/mine').set(store).expect(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].title).toBe('Primera consulta');
  });

  it('IGNORA el partnerId del body: no se pueden publicar cupones a nombre de otro', async () => {
    const created = await request(app)
      .post('/api/coupons/mine')
      .set(store)
      .send({ ...validCoupon, partnerId: otherStoreId, partnerType: 'vet' })
      .expect(201);

    expect(created.body.partnerId).toBe(storeId);
    expect(created.body.partnerType).toBe('store');

    // Y al de al lado no le aparece nada.
    const otros = await request(app).get('/api/coupons/mine').set(otherStore).expect(200);
    expect(otros.body.items).toHaveLength(0);
  });

  it('no deja acuñar Patitas sin tope', async () => {
    const res = await request(app)
      .post('/api/coupons/mine')
      .set(store)
      .send({ ...validCoupon, bonusPatitas: 999999 })
      .expect(400);

    expect(res.body.error).toBe('bonus_too_large');
    expect(res.body.max).toBe(200);
  });

  it('rechaza un bonus negativo', async () => {
    await request(app)
      .post('/api/coupons/mine')
      .set(store)
      .send({ ...validCoupon, bonusPatitas: -5 })
      .expect(400)
      .expect(res => expect(res.body.error).toBe('invalid_bonus'));
  });

  it('rechaza un cupón que nace caducado', async () => {
    const res = await request(app)
      .post('/api/coupons/mine')
      .set(store)
      .send({ ...validCoupon, expiresAt: '2020-01-01T00:00:00.000Z' })
      .expect(400);

    expect(res.body.error).toBe('expiration_in_past');
  });

  it('exige título y descuento', async () => {
    await request(app)
      .post('/api/coupons/mine')
      .set(store)
      .send({ description: 'sin nada más' })
      .expect(400)
      .expect(res => expect(res.body.error).toBe('missing_fields'));
  });

  it('edita el suyo pero no ve el de otro partner', async () => {
    const mio = await request(app).post('/api/coupons/mine').set(store).send(validCoupon).expect(201);

    await request(app)
      .patch(`/api/coupons/mine/${mio.body._id}`)
      .set(store)
      .send({ discount: '-25% en la primera compra', active: false })
      .expect(200)
      .expect(res => {
        expect(res.body.discount).toBe('-25% en la primera compra');
        expect(res.body.active).toBe(false);
      });

    // El de al lado no puede tocarlo, y recibe 404 (no 403): que exista no es
    // asunto suyo.
    await request(app)
      .patch(`/api/coupons/mine/${mio.body._id}`)
      .set(otherStore)
      .send({ discount: 'me lo quedo yo' })
      .expect(404);
  });

  it('no deja editar un cupón ya canjeado', async () => {
    const creado = await request(app).post('/api/coupons/mine').set(store).send(validCoupon).expect(201);

    await request(app)
      .post(`/api/coupons/${creado.body._id}/use`)
      .set(store)
      .send({})
      .expect(200);

    await request(app)
      .patch(`/api/coupons/mine/${creado.body._id}`)
      .set(store)
      .send({ discount: 'otra cosa' })
      .expect(409)
      .expect(res => expect(res.body.error).toBe('coupon_already_used'));
  });

  it('un adoptante no puede crear cupones', async () => {
    await request(app)
      .post('/api/coupons/mine')
      .set(headersFor(new mongoose.Types.ObjectId().toHexString(), 'tenant'))
      .send(validCoupon)
      .expect(403);
  });

  it('el cupón creado aparece en el catálogo público', async () => {
    await request(app).post('/api/coupons/mine').set(store).send(validCoupon).expect(201);

    const publico = await request(app).get('/api/coupons').expect(200);
    expect(publico.body.items.map((c: any) => c.title)).toContain('Primera consulta');
  });
});
