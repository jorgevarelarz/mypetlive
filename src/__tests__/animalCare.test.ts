import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

// Cuidado diario (`POST /api/animals/:id/care/feed|litter`). Estos endpoints no
// tenían ningún test y `authorizeCare` devolvía 403 a todo el mundo salvo admin:
// buscaba la adopción por `status: 'accepted'` (estado inexistente, legado del
// alquiler), no miraba `ownerId` (mascotas personales) y solo aceptaba el rol
// `landlord` cuando la ruta también admite `protectora`.

let app: any;
let mongo: MongoMemoryServer | undefined;
let Animal: any;
let Adoption: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  Animal = (await import('../models/animal.model')).Animal;
  Adoption = (await import('../models/adoption.model')).Adoption;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const shelterId = new mongoose.Types.ObjectId().toHexString();
const adopterId = new mongoose.Types.ObjectId().toHexString();
const strangerId = new mongoose.Types.ObjectId().toHexString();

const shelterH = { 'x-user-id': shelterId, 'x-user-role': 'protectora', 'x-user-verified': 'true' };
const adopterH = { 'x-user-id': adopterId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const strangerH = { 'x-user-id': strangerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
});

async function createShelterAnimal(extra: Record<string, unknown> = {}) {
  return Animal.create({
    shelter: shelterId,
    name: 'Luna',
    species: 'gato',
    age: '2 años',
    status: 'publicado',
    createdByRole: 'protectora',
    ...extra,
  });
}

async function createPersonalPet() {
  return Animal.create({
    shelter: adopterId,
    ownerId: adopterId,
    name: 'Michi',
    species: 'gato',
    age: '4 años',
    isPersonalPet: true,
    createdByRole: 'tenant',
  });
}

describe('cuidado diario: quién puede registrarlo', () => {
  it('el adoptante puede marcar comida del animal que adoptó (adopción aprobada)', async () => {
    const animal = await createShelterAnimal();
    await Adoption.create({ animalId: String(animal._id), adopterId, status: 'aprobada' });

    const res = await request(app).post(`/api/animals/${animal._id}/care/feed`).set(adopterH).send({});

    expect(res.status).toBe(200);
    expect(res.body.lastFeeding).toBeTruthy();
  });

  it('el dueño de una mascota personal puede marcar comida y arena', async () => {
    const pet = await createPersonalPet();

    const feed = await request(app).post(`/api/animals/${pet._id}/care/feed`).set(adopterH).send({});
    const litter = await request(app).post(`/api/animals/${pet._id}/care/litter`).set(adopterH).send({});

    expect(feed.status).toBe(200);
    expect(litter.status).toBe(200);
    expect(litter.body.lastLitterChange).toBeTruthy();
  });

  it('la protectora dueña del animal puede registrar el cuidado', async () => {
    const animal = await createShelterAnimal();

    const res = await request(app).post(`/api/animals/${animal._id}/care/feed`).set(shelterH).send({});

    expect(res.status).toBe(200);
  });

  it('una solicitud que aún no está aprobada no da permiso', async () => {
    const animal = await createShelterAnimal();
    await Adoption.create({ animalId: String(animal._id), adopterId, status: 'en_revision' });

    const res = await request(app).post(`/api/animals/${animal._id}/care/feed`).set(adopterH).send({});

    expect(res.status).toBe(403);
  });

  it('un tercero sin relación con el animal recibe 403', async () => {
    const animal = await createShelterAnimal();

    const res = await request(app).post(`/api/animals/${animal._id}/care/feed`).set(strangerH).send({});

    expect(res.status).toBe(403);
  });
});
