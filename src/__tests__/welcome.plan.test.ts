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
let Coupon: any;
let WelcomePlan: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Coupon = (await import('../models/coupon.model')).Coupon;
  WelcomePlan = (await import('../models/welcomePlan.model')).WelcomePlan;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const shelterId = new mongoose.Types.ObjectId().toHexString();
const adopterId = new mongoose.Types.ObjectId().toHexString();
const otherId = new mongoose.Types.ObjectId().toHexString();
const protectoraH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const adopterH = { 'x-user-id': adopterId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const otherH = { 'x-user-id': otherId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  (sendEmail as jest.Mock).mockClear();
  await User.create([
    { _id: shelterId, name: 'Protectora Sur', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord' },
    { _id: adopterId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: otherId, name: 'Bea', email: 'bea@test.com', passwordHash: 'x', role: 'tenant' },
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

async function approveAdoption(animalId: string) {
  const apply = await request(app).post('/api/adoptions').set(adopterH).send({ animalId }).expect(201);
  await request(app)
    .patch(`/api/adoptions/${apply.body.id}/status`)
    .set(protectoraH)
    .send({ status: 'preaprobada' })
    .expect(200);
  await request(app)
    .patch(`/api/adoptions/${apply.body.id}/status`)
    .set(protectoraH)
    .send({ status: 'aprobada' })
    .expect(200);
  return apply.body.id as string;
}

describe('Plan de bienvenida post-adopción', () => {
  it('al aprobar, crea el plan y envía la guía de primeros pasos con ofertas segmentadas', async () => {
    await Coupon.create({
      partnerType: 'store',
      copy: 'Kit de bienvenida gatuno',
      title: 'Kit de bienvenida gatuno',
      discount: '20%',
      targetSpecies: ['gato'],
    });
    const animalId = await publishAnimal();
    (sendEmail as jest.Mock).mockClear();
    await approveAdoption(animalId);

    const plan = await WelcomePlan.findOne({ animalId }).lean();
    expect(plan).toBeTruthy();
    expect(String(plan.ownerId)).toBe(adopterId);

    // approveAdoption pasa por 'preaprobada' (que también avisa); buscamos el de bienvenida.
    const toAdopter = (sendEmail as jest.Mock).mock.calls.find(
      c => c[0] === 'ana@test.com' && String(c[1]).includes('Bienvenido a casa'),
    );
    expect(toAdopter).toBeTruthy();
    expect(toAdopter[2]).toContain('primeros pasos');
    expect(toAdopter[2]).toContain('Kit de bienvenida gatuno');
    // HTML brandeado como cuarto argumento.
    expect(toAdopter[3]).toContain('plan de bienvenida');
  });

  it('aprobar dos veces no duplica el plan', async () => {
    const animalId = await publishAnimal();
    const adoptionId = await approveAdoption(animalId);
    await request(app)
      .patch(`/api/adoptions/${adoptionId}/status`)
      .set(protectoraH)
      .send({ status: 'aprobada' })
      .expect(200);
    expect(await WelcomePlan.countDocuments({ animalId })).toBe(1);
  });

  it('el adoptante consulta su plan con la checklist completa', async () => {
    const animalId = await publishAnimal();
    await approveAdoption(animalId);

    const res = await request(app).get(`/api/welcome/${animalId}`).set(adopterH).expect(200);
    expect(res.body.tasks).toHaveLength(5);
    expect(res.body.progress).toEqual({ done: 0, total: 5 });
    expect(res.body.tasks.map((t: any) => t.key)).toContain('vet_visit');
  });

  it('marca y desmarca tareas, y rechaza claves inválidas', async () => {
    const animalId = await publishAnimal();
    await approveAdoption(animalId);

    const done = await request(app).post(`/api/welcome/${animalId}/tasks/vet_visit`).set(adopterH).expect(200);
    expect(done.body.progress.done).toBe(1);
    expect(done.body.tasks.find((t: any) => t.key === 'vet_visit').done).toBe(true);

    const undone = await request(app).post(`/api/welcome/${animalId}/tasks/vet_visit`).set(adopterH).expect(200);
    expect(undone.body.progress.done).toBe(0);

    await request(app).post(`/api/welcome/${animalId}/tasks/inventada`).set(adopterH).expect(400);
  });

  it('solo el dueño (o admin) accede al plan', async () => {
    const animalId = await publishAnimal();
    await approveAdoption(animalId);

    await request(app).get(`/api/welcome/${animalId}`).set(otherH).expect(403);
    await request(app).post(`/api/welcome/${animalId}/tasks/vet_visit`).set(otherH).expect(403);
    await request(app).get(`/api/welcome/${animalId}`).set(protectoraH).expect(403);
  });

  it('sin adopción aprobada no hay plan', async () => {
    const animalId = await publishAnimal();
    await request(app).get(`/api/welcome/${animalId}`).set(adopterH).expect(404);
  });
});
