import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { catalogKey } from '../utils/petCatalog';

/**
 * Catálogo de comida y arena (21-10-2026): autocompletado al marcar comida y
 * en la despensa, y lo que la gente apunta se suma solo.
 */
let app: any;
let mongo: MongoMemoryServer | undefined;
const userId = new mongoose.Types.ObjectId().toHexString();
const headers = { 'x-user-id': userId, 'x-user-role': 'tenant' };

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  const mod = await import('../app');
  app = mod.app || mod.default;
  const { PetProduct } = await import('../models/petProduct.model');
  await PetProduct.syncIndexes();
  await PetProduct.create([
    { kind: 'food', name: 'Royal Canin Indoor', key: catalogKey('Royal Canin Indoor'), species: ['cat'], source: 'seed', uses: 5 },
    { kind: 'food', name: 'Royal Canin Mini Adult', key: catalogKey('Royal Canin Mini Adult'), species: ['dog'], source: 'seed', uses: 9 },
    { kind: 'food', name: 'Pienso', key: 'pienso', species: [], source: 'seed' },
    { kind: 'litter', name: 'Arena aglomerante', key: catalogKey('Arena aglomerante'), species: [], source: 'seed' },
  ]);
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

describe('catálogo de comida y arena', () => {
  it('normaliza la clave', () => {
    expect(catalogKey('  Comida  Húmeda (Lata) ')).toBe('comida humeda lata');
  });

  it('busca por palabras en cualquier orden y filtra por especie', async () => {
    let res = await request(app).get('/api/catalog/pet-products?q=canin roy&kind=food').expect(200);
    expect(res.body.items.map((i: any) => i.name)).toEqual(['Royal Canin Mini Adult', 'Royal Canin Indoor']);
    res = await request(app).get('/api/catalog/pet-products?q=roy&kind=food&species=gato').expect(200);
    expect(res.body.items.map((i: any) => i.name)).toEqual(['Royal Canin Indoor']);
    res = await request(app).get('/api/catalog/pet-products?q=aglo&kind=litter').expect(200);
    expect(res.body.items[0].name).toBe('Arena aglomerante');
  });

  it('lo que se marca como comida se suma al catálogo', async () => {
    const pet = await request(app).post('/api/animals/personal').set(headers)
      .send({ name: 'Luna', species: 'cat', age: '2 años' }).expect(201);
    await request(app).post(`/api/animals/${pet.body._id}/care/feed`).set(headers)
      .send({ foods: ['Lata de atún casera'] }).expect(200);
    await new Promise(r => setTimeout(r, 200));
    const res = await request(app).get('/api/catalog/pet-products?q=atun&kind=food').expect(200);
    expect(res.body.items[0].name).toBe('Lata de atún casera');
  });
});
