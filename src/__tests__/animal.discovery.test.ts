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

const shelterId = new mongoose.Types.ObjectId().toHexString();
const userId = new mongoose.Types.ObjectId().toHexString();
const shelterHeaders = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const userHeaders = { 'x-user-id': userId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

async function createPublishedAnimal(overrides: Record<string, any> = {}) {
  const created = await request(app)
    .post('/api/animals')
    .set(shelterHeaders)
    .send({
      shelter: shelterId,
      name: 'Nina',
      species: 'perro',
      sex: 'female',
      age: '1 año',
      ageGroup: 'young',
      city: 'Madrid',
      size: 'medium',
      goodWithChildren: true,
      goodWithDogs: true,
      goodWithCats: false,
      ...overrides,
    })
    .expect(201);
  await request(app)
    .patch(`/api/animals/${created.body._id}/status`)
    .set(shelterHeaders)
    .send({ status: 'publicado' })
    .expect(200);
  return created.body;
}

describe('Animal discovery', () => {
  it('persists favorites and supports importing local IDs', async () => {
    const nina = await createPublishedAnimal();
    const milo = await createPublishedAnimal({ name: 'Milo', species: 'gato', city: 'Valencia' });

    await request(app).post(`/api/animals/${nina._id}/favorite`).set(userHeaders).expect(201);
    await request(app)
      .post('/api/animals/favorites/import')
      .set(userHeaders)
      .send({ ids: [nina._id, milo._id] })
      .expect(200);

    const favorites = await request(app).get('/api/animals/favorites').set(userHeaders).expect(200);
    expect(favorites.body.ids).toHaveLength(2);
    expect(favorites.body.items.map((item: any) => item.name).sort()).toEqual(['Milo', 'Nina']);

    await request(app).delete(`/api/animals/${nina._id}/favorite`).set(userHeaders).expect(200);
    const remaining = await request(app).get('/api/animals/favorites').set(userHeaders).expect(200);
    expect(remaining.body.ids).toEqual([milo._id]);
  });

  it('filters companions and manages saved alerts', async () => {
    await createPublishedAnimal();
    await createPublishedAnimal({
      name: 'Milo',
      species: 'gato',
      city: 'Valencia',
      ageGroup: 'adult',
      goodWithChildren: false,
      goodWithDogs: false,
      goodWithCats: true,
    });

    const filtered = await request(app)
      .get('/api/animals')
      .query({ city: 'madrid', ageGroup: 'young', goodWithChildren: 'true' })
      .expect(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].name).toBe('Nina');

    const created = await request(app)
      .post('/api/animals/alerts')
      .set(userHeaders)
      .send({ filters: { city: 'Madrid', goodWithChildren: true } })
      .expect(201);
    expect(created.body.matches).toBe(1);
    expect(created.body.active).toBe(true);

    await request(app)
      .patch(`/api/animals/alerts/${created.body._id}`)
      .set(userHeaders)
      .send({ active: false })
      .expect(200);

    const alerts = await request(app).get('/api/animals/alerts').set(userHeaders).expect(200);
    expect(alerts.body.items).toHaveLength(1);
    expect(alerts.body.items[0].active).toBe(false);

    await request(app).delete(`/api/animals/alerts/${created.body._id}`).set(userHeaders).expect(200);
  });
});
