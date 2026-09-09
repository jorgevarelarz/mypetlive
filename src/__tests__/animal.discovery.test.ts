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

// Regresión de la auditoría del 5 sep 2026: `getById`/`search` devolvían el
// documento entero (avistamientos con contacto/GPS, ownerId, __v) a
// CUALQUIERA, y un borrador se veía igual que uno publicado con solo conocer
// (o adivinar) su ID.
describe('Visibilidad pública de animales', () => {
  it('esconde un borrador de cualquiera que no sea su protectora', async () => {
    const created = await request(app)
      .post('/api/animals')
      .set(shelterHeaders)
      .send({
        shelter: shelterId,
        name: 'Sombra',
        species: 'perro',
        sex: 'male',
        age: '1 año',
        size: 'medium',
      })
      .expect(201);
    expect(created.body.status).toBe('borrador');

    await request(app).get(`/api/animals/${created.body._id}`).expect(404);
    await request(app).get(`/api/animals/${created.body._id}`).set(userHeaders).expect(404);

    const asOwner = await request(app)
      .get(`/api/animals/${created.body._id}`)
      .set(shelterHeaders)
      .expect(200);
    expect(asOwner.body.status).toBe('borrador');
  });

  it('no expone avistamientos, ownerId ni __v en el detalle ni en el catálogo público', async () => {
    const nina = await createPublishedAnimal();
    await request(app)
      .post(`/api/animals/${nina._id}/lost`)
      .set(shelterHeaders)
      .send({ area: 'Retiro' })
      .expect(200);
    await request(app)
      .post(`/api/animals/passport/${nina.code}/sighting`)
      .send({ lat: 40, lng: -3, contact: 'quien-lo-vio@test.com', note: 'cerca del lago' })
      .expect(201);

    const detail = await request(app).get(`/api/animals/${nina._id}`).expect(200);
    expect(detail.body.lost?.sightings).toBeUndefined();
    expect(detail.body.ownerId).toBeUndefined();
    expect(detail.body.__v).toBeUndefined();

    const catalog = await request(app).get('/api/animals').query({ code: nina.code }).expect(200);
    expect(catalog.body.items[0].lost?.sightings).toBeUndefined();
    expect(catalog.body.items[0].ownerId).toBeUndefined();
    expect(catalog.body.items[0].__v).toBeUndefined();

    // La protectora dueña sí necesita ver los avistamientos: es lo único que
    // le dice quién ha escrito para devolver al animal.
    const asOwner = await request(app)
      .get(`/api/animals/${nina._id}`)
      .set(shelterHeaders)
      .expect(200);
    expect(asOwner.body.lost.sightings).toHaveLength(1);
  });

  it('devuelve 404 (no 500) ante un ID mal formado', async () => {
    await request(app).get('/api/animals/no-es-un-object-id').expect(404);
  });
});
