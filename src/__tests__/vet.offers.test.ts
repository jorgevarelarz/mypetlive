import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const vetId = new mongoose.Types.ObjectId().toHexString();
const otherVetId = new mongoose.Types.ObjectId().toHexString();
const shelterId = new mongoose.Types.ObjectId().toHexString();

const vetH = { 'x-user-id': vetId, 'x-user-role': 'vet', 'x-user-verified': 'true' };
const otherVetH = { 'x-user-id': otherVetId, 'x-user-role': 'vet', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: vetId, name: 'Clínica Sur', email: 'vet@test.com', passwordHash: 'x', role: 'vet' },
    { _id: otherVetId, name: 'Clínica Norte', email: 'vet2@test.com', passwordHash: 'x', role: 'vet' },
    { _id: shelterId, name: 'Protectora', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord' },
  ]);
});

describe('Ofertas de servicio del veterinario', () => {
  it('el vet crea una oferta propia y la lista', async () => {
    const created = await request(app)
      .post('/api/vet/offers')
      .set(vetH)
      .send({ copy: 'Primera revisión gratis', discount: 'Gratis', serviceType: 'Revisión', targetSpecies: ['cat'] })
      .expect(201);
    expect(created.body.serviceType).toBe('Revisión');
    expect(created.body.targetSpecies).toEqual(['cat']);

    const mine = await request(app).get('/api/vet/offers').set(vetH).expect(200);
    expect(mine.body.items).toHaveLength(1);
    // No ve las de otro vet
    const other = await request(app).get('/api/vet/offers').set(otherVetH).expect(200);
    expect(other.body.items).toHaveLength(0);
  });

  it('la oferta del vet aparece en el pasaporte del animal que encaja', async () => {
    await request(app).post('/api/vet/offers').set(vetH)
      .send({ copy: 'Vacuna -30%', discount: '30%', serviceType: 'Vacunación', targetSpecies: ['cat'] })
      .expect(201);
    // Animal gato (se normaliza a cat) de una protectora
    await request(app).post('/api/animals')
      .set({ 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' })
      .send({ shelter: shelterId, name: 'Luna', species: 'gato', sex: 'female', age: '2', size: 'small', status: 'publicado', code: undefined })
      .expect(201);
    const luna: any = await Animal.findOne({ name: 'Luna' }).lean();

    const res = await request(app).get(`/api/offers/for-animal/${luna.code}`).expect(200);
    const titles = res.body.items.map((o: any) => o.title);
    expect(titles).toContain('Vacuna -30%');
    const offer = res.body.items.find((o: any) => o.title === 'Vacuna -30%');
    expect(offer.serviceType).toBe('Vacunación');
  });

  it('toggle y delete solo sobre ofertas propias', async () => {
    const created = await request(app).post('/api/vet/offers').set(vetH).send({ copy: 'X', discount: '5%' }).expect(201);
    const id = created.body._id;
    // otro vet no puede tocarla
    await request(app).patch(`/api/vet/offers/${id}/toggle`).set(otherVetH).expect(403);
    await request(app).delete(`/api/vet/offers/${id}`).set(otherVetH).expect(403);
    // el dueño sí
    const toggled = await request(app).patch(`/api/vet/offers/${id}/toggle`).set(vetH).expect(200);
    expect(toggled.body.active).toBe(false);
    await request(app).delete(`/api/vet/offers/${id}`).set(vetH).expect(200);
  });

  it('exige copy y discount', async () => {
    await request(app).post('/api/vet/offers').set(vetH).send({ discount: '5%' }).expect(400);
    await request(app).post('/api/vet/offers').set(vetH).send({ copy: 'X' }).expect(400);
  });
});
