import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

import { sendEmail } from '../utils/notification';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const shelterId = new mongoose.Types.ObjectId().toHexString();
const adopterId = new mongoose.Types.ObjectId().toHexString();
const protectoraH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const adopterH = { 'x-user-id': adopterId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  (sendEmail as jest.Mock).mockClear();
  await User.create([
    { _id: shelterId, name: 'Protectora Sur', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord' },
    { _id: adopterId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
});

async function publishAnimal() {
  const create = await request(app)
    .post('/api/animals')
    .set(protectoraH)
    .send({ shelter: shelterId, name: 'Luna', species: 'gato', sex: 'female', age: '2 años', size: 'small' })
    .expect(201);
  await request(app)
    .patch(`/api/animals/${create.body._id}/status`)
    .set(protectoraH)
    .send({ status: 'publicado' })
    .expect(200);
  return create.body._id as string;
}

describe('Emails transaccionales de adopción', () => {
  it('avisa a la protectora cuando entra una solicitud nueva', async () => {
    const animalId = await publishAnimal();
    await request(app).post('/api/adoptions').set(adopterH).send({ animalId }).expect(201);

    const toShelter = (sendEmail as jest.Mock).mock.calls.find(c => c[0] === 'shelter@test.com');
    expect(toShelter).toBeTruthy();
    expect(toShelter[1]).toContain('Luna');
    expect(toShelter[2]).toContain('Ana');
  });

  it('avisa al adoptante cuando la protectora cambia el estado', async () => {
    const animalId = await publishAnimal();
    const apply = await request(app).post('/api/adoptions').set(adopterH).send({ animalId }).expect(201);
    (sendEmail as jest.Mock).mockClear();

    await request(app)
      .patch(`/api/adoptions/${apply.body.id}/status`)
      .set(protectoraH)
      .send({ status: 'en_revision' })
      .expect(200);

    const toAdopter = (sendEmail as jest.Mock).mock.calls.find(c => c[0] === 'ana@test.com');
    expect(toAdopter).toBeTruthy();
    expect(toAdopter[2]).toContain('Luna');
  });

  it('al rechazar, sugiere al adoptante animales parecidos que siguen publicados', async () => {
    const publishOther = async (name: string, species: string) => {
      const create = await request(app)
        .post('/api/animals')
        .set(protectoraH)
        .send({ shelter: shelterId, name, species, sex: 'female', age: '2 años', size: 'small' })
        .expect(201);
      await request(app)
        .patch(`/api/animals/${create.body._id}/status`)
        .set(protectoraH)
        .send({ status: 'publicado' })
        .expect(200);
      return create.body._id as string;
    };

    const animalId = await publishAnimal(); // Luna, gata
    const similarId = await publishOther('Michi', 'gato');
    await publishOther('Toby', 'perro');

    const apply = await request(app).post('/api/adoptions').set(adopterH).send({ animalId }).expect(201);
    (sendEmail as jest.Mock).mockClear();

    await request(app)
      .patch(`/api/adoptions/${apply.body.id}/status`)
      .set(protectoraH)
      .send({ status: 'rechazada' })
      .expect(200);

    const toAdopter = (sendEmail as jest.Mock).mock.calls.find(c => c[0] === 'ana@test.com');
    expect(toAdopter).toBeTruthy();
    expect(toAdopter[2]).toContain('rechazada');
    // Sugiere a la gata parecida con su enlace, no al perro.
    expect(toAdopter[2]).toContain('Michi');
    expect(toAdopter[2]).toContain(`/animals/${similarId}`);
    expect(toAdopter[2]).not.toContain('Toby');
  });

  it('avisa por alerta de búsqueda al publicar un animal que encaja', async () => {
    // Alerta del adoptante: gatos
    await request(app).post('/api/animals/alerts').set(adopterH).send({ filters: { species: 'gato' } }).expect(201);
    (sendEmail as jest.Mock).mockClear();

    await publishAnimal();
    // notifyMatchingAlerts es fire-and-forget: dar un tick para que resuelva.
    await new Promise(r => setTimeout(r, 50));

    const toAdopter = (sendEmail as jest.Mock).mock.calls.find(c => c[0] === 'ana@test.com');
    expect(toAdopter).toBeTruthy();
    expect(toAdopter[1]).toContain('Luna');
  });
});
