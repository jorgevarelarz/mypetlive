import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { User } from '../models/user.model';
import { Verification } from '../models/verification.model';
import { Animal } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { canManageAnimal } from '../utils/animalAccess';

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

const shelterId = new mongoose.Types.ObjectId().toHexString();
const adopterId = new mongoose.Types.ObjectId().toHexString();
const adminId = new mongoose.Types.ObjectId().toHexString();

const protectoraH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const adopterH = { 'x-user-id': adopterId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const adminH = { 'x-user-id': adminId, 'x-user-role': 'admin', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: shelterId, name: 'Protectora Sur', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord' },
    { _id: adopterId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: adminId, name: 'Admin', email: 'admin@test.com', passwordHash: 'x', role: 'admin' },
  ]);
  await Verification.create({ userId: shelterId, status: 'verified', verificationLevel: 'animal_protection_entity' });
});

async function publishedAnimal() {
  const create = await request(app)
    .post('/api/animals')
    .set(protectoraH)
    .send({ shelter: shelterId, name: 'Nala', species: 'perro', sex: 'female', age: '3 años', size: 'medium' })
    .expect(201);
  const animalId = create.body._id;
  await request(app).patch(`/api/animals/${animalId}/status`).set(protectoraH).send({ status: 'publicado' }).expect(200);
  return animalId;
}

const setStatus = (id: string, status: string) =>
  request(app).patch(`/api/adoptions/${id}/status`).set(protectoraH).send({ status });

async function approvedAdoption() {
  const animalId = await publishedAnimal();
  const mine = await request(app).post('/api/adoptions').set(adopterH).send({ animalId }).expect(201);
  await setStatus(mine.body.id, 'en_revision').expect(200);
  await setStatus(mine.body.id, 'preaprobada').expect(200);
  await setStatus(mine.body.id, 'aprobada').expect(200);
  return { animalId, adoptionId: mine.body.id };
}

describe('La protectora anterior no gestiona una mascota ya adoptada', () => {
  it('DELETE y PUT de la protectora devuelven 403 y el animal sigue intacto', async () => {
    const { animalId } = await approvedAdoption();

    await request(app).delete(`/api/animals/${animalId}`).set(protectoraH).expect(403);
    expect(await Animal.exists({ _id: animalId })).toBeTruthy();

    await request(app).put(`/api/animals/${animalId}`).set(protectoraH).send({ name: 'Otro' }).expect(403);
    const after = await Animal.findById(animalId).lean();
    expect(after?.name).toBe('Nala');
  });

  it('PATCH /status y POST /lost de la protectora anterior devuelven 403', async () => {
    const { animalId } = await approvedAdoption();

    await request(app).patch(`/api/animals/${animalId}/status`).set(protectoraH).send({ status: 'publicado' }).expect(403);
    expect((await Animal.findById(animalId).lean())?.status).toBe('adoptado');

    await request(app).post(`/api/animals/${animalId}/lost`).set(protectoraH).send({ area: 'Sada' }).expect(403);
  });

  it('el adoptante sigue pudiendo editar su ficha y activar el modo perdido', async () => {
    const { animalId } = await approvedAdoption();

    await request(app).put(`/api/animals/mine/${animalId}`).set(adopterH).send({ size: 'small' }).expect(200);
    await request(app).post(`/api/animals/${animalId}/lost`).set(adopterH).send({ area: 'Sada' }).expect(200);
  });

  it('el admin edita con 200 y, con la adopción aprobada, no puede borrar (409)', async () => {
    const { animalId } = await approvedAdoption();

    await request(app).put(`/api/animals/${animalId}`).set(adminH).send({ name: 'Nala II' }).expect(200);
    const res = await request(app).delete(`/api/animals/${animalId}`).set(adminH).expect(409);
    expect(res.body.error).toBe('adoption_in_progress');
    expect(await Animal.exists({ _id: animalId })).toBeTruthy();
  });

  it('tras deshacer la aprobación, la protectora vuelve a poder editar', async () => {
    const { animalId, adoptionId } = await approvedAdoption();

    await request(app)
      .post(`/api/adoptions/${adoptionId}/undo-approval`)
      .set(protectoraH)
      .send({ reason: 'La familia se echó atrás' })
      .expect(200);
    await request(app).put(`/api/animals/${animalId}`).set(protectoraH).send({ name: 'Otro' }).expect(200);
  });

  it('un animal marcado adoptado a mano, sin ownerId, lo sigue gestionando su protectora', async () => {
    const animalId = await publishedAnimal();
    await Animal.updateOne({ _id: animalId }, { $unset: { ownerId: 1 } });

    await request(app).patch(`/api/animals/${animalId}/status`).set(protectoraH).send({ status: 'adoptado' }).expect(200);
    await request(app).patch(`/api/animals/${animalId}/status`).set(protectoraH).send({ status: 'publicado' }).expect(200);
    expect((await Animal.findById(animalId).lean())?.status).toBe('publicado');
  });
});

describe('Borrar un animal con solicitudes de adopción', () => {
  async function animalWithRequest(status: string) {
    const animalId = await publishedAnimal();
    await Adoption.create({ animalId, adopterId, shelterId, status });
    return animalId;
  }

  it('con una solicitud preaprobada devuelve 409 adoption_in_progress', async () => {
    const animalId = await animalWithRequest('preaprobada');
    const res = await request(app).delete(`/api/animals/${animalId}`).set(protectoraH).expect(409);
    expect(res.body.error).toBe('adoption_in_progress');
    expect(await Animal.exists({ _id: animalId })).toBeTruthy();
  });

  it('con una cita propuesta también devuelve 409', async () => {
    const animalId = await animalWithRequest('cita_propuesta');
    await request(app).delete(`/api/animals/${animalId}`).set(protectoraH).expect(409);
  });

  it('sin solicitudes, la protectora lo borra (200)', async () => {
    const animalId = await publishedAnimal();
    await request(app).delete(`/api/animals/${animalId}`).set(protectoraH).expect(200);
    expect(await Animal.exists({ _id: animalId })).toBeFalsy();
  });

  // «Pendiente» en el modelo son `recibida` y `cuestionario_pendiente`.
  it.each(['recibida', 'cuestionario_pendiente', 'en_revision', 'info_adicional', 'rechazada', 'cancelada'])(
    'con una solicitud %s, la protectora lo borra (200)',
    async (status) => {
      const animalId = await animalWithRequest(status);
      await request(app).delete(`/api/animals/${animalId}`).set(protectoraH).expect(200);
      expect(await Animal.exists({ _id: animalId })).toBeFalsy();
    },
  );
});

describe('canManageAnimal', () => {
  const A = new mongoose.Types.ObjectId().toHexString();
  const B = new mongoose.Types.ObjectId().toHexString();
  const userA = { _id: A, role: 'landlord' };
  const userB = { _id: B, role: 'tenant' };
  const admin = { _id: 'admin', role: 'admin' };

  it('mascota de familia: solo el dueño y el admin', () => {
    const pet = { shelter: A, ownerId: B, isPersonalPet: true, status: 'adoptado' };
    expect(canManageAnimal(userA, pet)).toBe(false);
    expect(canManageAnimal(userB, pet)).toBe(true);
    expect(canManageAnimal(admin, pet)).toBe(true);
  });

  it('status adoptado sin isPersonalPet también cuenta como mascota de familia', () => {
    expect(canManageAnimal(userA, { shelter: A, ownerId: B, status: 'adoptado' })).toBe(false);
  });

  it('animal de protectora: igual que antes', () => {
    const animal = { shelter: A, ownerId: A, isPersonalPet: false, status: 'publicado' };
    expect(canManageAnimal(userA, animal)).toBe(true);
    expect(canManageAnimal(userB, animal)).toBe(false);
    expect(canManageAnimal(admin, animal)).toBe(true);
    expect(canManageAnimal(null, animal)).toBe(false);
  });

  it('con shelter y ownerId poblados sigue funcionando', () => {
    const animal = { shelter: { _id: A, name: 'Protectora' }, status: 'publicado' };
    expect(canManageAnimal(userA, animal)).toBe(true);
    const pet = { shelter: { _id: A }, ownerId: { _id: B }, isPersonalPet: true };
    expect(canManageAnimal(userB, pet)).toBe(true);
    expect(canManageAnimal(userA, pet)).toBe(false);
  });

  it('adoptado sin ownerId: lo gestiona la protectora', () => {
    expect(canManageAnimal(userA, { shelter: { _id: A }, status: 'adoptado' })).toBe(true);
    expect(canManageAnimal(userB, { shelter: A, status: 'adoptado' })).toBe(false);
  });
});
