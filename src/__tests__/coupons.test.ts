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

const adminHeaders = {
  'x-user-id': new mongoose.Types.ObjectId().toHexString(),
  'x-user-role': 'admin',
  'x-user-verified': 'true',
};

describe('Coupons API', () => {
  it('creates and lists coupons', async () => {
    const create = await request(app)
      .post('/api/coupons')
      .set(adminHeaders)
      .send({ partnerType: 'store', title: 'Pienso', description: 'Pienso premium', discount: '-10% en saco', targetAnimalCode: 'luna-123' })
      .expect(201);

    expect(create.body.title).toBe('Pienso');
    expect(create.body.targetAnimalCode).toBe('LUNA-123');

    const list = await request(app).get('/api/coupons').expect(200);
    expect(list.body.items).toHaveLength(1);
  });

  it('allows admin to update coupon', async () => {
    const create = await request(app)
      .post('/api/coupons')
      .set(adminHeaders)
      .send({ partnerType: 'vet', title: 'Chequeo', description: 'Consulta general', discount: '-15€' })
      .expect(201);

    const patch = await request(app)
      .patch(`/api/coupons/${create.body._id}`)
      .set(adminHeaders)
      .send({ active: false, targetAnimalCode: null })
      .expect(200);

    expect(patch.body.active).toBe(false);
    expect(patch.body.targetAnimalCode).toBeFalsy();

    const list = await request(app).get('/api/coupons').expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('rejects invalid animal code format', async () => {
    await request(app)
      .post('/api/coupons')
      .set(adminHeaders)
      .send({ partnerType: 'store', title: 'Pienso', description: 'Desc', discount: '-5%', targetAnimalCode: 'BADCODE' })
      .expect(400);
  });
});
