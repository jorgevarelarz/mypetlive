import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { User } from '../models/user.model';
import { Animal } from '../models/animal.model';
import { Verification } from '../models/verification.model';

// Una protectora sin verificar no puede sacar un animal en ningún estado que se
// vea en público (publicado, reservado, preadoptado), por ninguna de las tres
// puertas: alta, edición de la ficha y cambio rápido de estado. Y `adoptado` no
// se pone editando la ficha: lo pone el flujo de adopción.

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
  await Promise.all([User.deleteMany({}), Verification.deleteMany({}), Animal.deleteMany({})]);
});

// `x-user-verified: 'false'` para que no actúe el bypass de pruebas de
// `canPublishAnimals`: la verificación la decide el documento `Verification`.
const shelterHeaders = (id: string) => ({
  'x-user-id': id,
  'x-user-role': 'landlord',
  'x-user-verified': 'false',
});

async function makeShelter(verified: boolean) {
  const shelter = await User.create({
    name: verified ? 'Protectora verificada' : 'Protectora sin verificar',
    email: `${new mongoose.Types.ObjectId().toHexString()}@shelter.app`,
    passwordHash: 'hash',
    role: 'landlord',
  });
  if (verified) {
    await Verification.create({ userId: String(shelter._id), status: 'verified', verificationLevel: 'animal_protection_entity' });
  }
  return String(shelter._id);
}

const animalBody = (shelter: string, status: string) => ({
  shelter,
  name: 'Luna',
  species: 'dog',
  sex: 'female',
  age: '2 años',
  size: 'medium',
  status,
});

async function makeAnimal(shelter: string, status: string) {
  const a = await Animal.create({ ...animalBody(shelter, status), createdByRole: 'protectora', isPersonalPet: false });
  return String(a._id);
}

describe('Verificación para publicar animales en estados públicos', () => {
  it.each(['reservado', 'preadoptado'])('POST en %s sin verificar da 403 y no crea nada', async status => {
    const shelter = await makeShelter(false);
    const res = await request(app).post('/api/animals').set(shelterHeaders(shelter)).send(animalBody(shelter, status));
    expect(res.status).toBe(403);
    expect(res.body?.error).toBe('shelter_verification_required');
    expect(await Animal.countDocuments()).toBe(0);
  });

  it.each(['reservado', 'preadoptado'])('PUT de borrador a %s sin verificar da 403 y sigue en borrador', async status => {
    const shelter = await makeShelter(false);
    const id = await makeAnimal(shelter, 'borrador');
    const res = await request(app).put(`/api/animals/${id}`).set(shelterHeaders(shelter)).send({ status });
    expect(res.status).toBe(403);
    expect(res.body?.error).toBe('shelter_verification_required');
    const after = await Animal.findById(id).lean();
    expect(after?.status).toBe('borrador');
  });

  it('PATCH /:id/status a preadoptado sin verificar da 403', async () => {
    const shelter = await makeShelter(false);
    const id = await makeAnimal(shelter, 'borrador');
    const res = await request(app).patch(`/api/animals/${id}/status`).set(shelterHeaders(shelter)).send({ status: 'preadoptado' });
    expect(res.status).toBe(403);
    expect(res.body?.error).toBe('shelter_verification_required');
    const after = await Animal.findById(id).lean();
    expect(after?.status).toBe('borrador');
  });

  it('PUT con adoptado sobre un animal publicado da 400 aunque la protectora esté verificada', async () => {
    const shelter = await makeShelter(true);
    const id = await makeAnimal(shelter, 'publicado');
    const res = await request(app).put(`/api/animals/${id}`).set(shelterHeaders(shelter)).send({ status: 'adoptado' });
    expect(res.status).toBe(400);
    expect(res.body?.error).toBe('invalid_status_transition');
    const after = await Animal.findById(id).lean();
    expect(after?.status).toBe('publicado');
  });

  it('PUT de un animal ya adoptado reenviando adoptado guarda el resto de campos', async () => {
    const shelter = await makeShelter(false);
    const id = await makeAnimal(shelter, 'adoptado');
    const res = await request(app)
      .put(`/api/animals/${id}`)
      .set(shelterHeaders(shelter))
      .send({ status: 'adoptado', description: 'Ya está en su casa' });
    expect(res.status).toBe(200);
    const after = await Animal.findById(id).lean();
    expect(after?.status).toBe('adoptado');
    expect((after as any)?.description).toBe('Ya está en su casa');
  });

  it('una protectora sin verificar puede crear en borrador y pasar a no_disponible', async () => {
    const shelter = await makeShelter(false);
    const created = await request(app).post('/api/animals').set(shelterHeaders(shelter)).send(animalBody(shelter, 'borrador'));
    expect(created.status).toBe(201);
    const res = await request(app).put(`/api/animals/${created.body._id}`).set(shelterHeaders(shelter)).send({ status: 'no_disponible' });
    expect(res.status).toBe(200);
    expect(res.body?.status).toBe('no_disponible');
  });

  it('una protectora verificada puede crear en reservado', async () => {
    const shelter = await makeShelter(true);
    const res = await request(app).post('/api/animals').set(shelterHeaders(shelter)).send(animalBody(shelter, 'reservado'));
    expect(res.status).toBe(201);
    expect(res.body?.status).toBe('reservado');
  });
});
