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
const adopterId = new mongoose.Types.ObjectId().toHexString();

const protectoraHeaders = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const adopterHeaders = { 'x-user-id': adopterId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

describe('Flujo completo de adopción (MyPetLive)', () => {
  it('protectora crea animal, publica, adoptante solicita y la protectora aprueba', async () => {
    // 1) Crear animal: arranca en borrador
    const create = await request(app)
      .post('/api/animals')
      .set(protectoraHeaders)
      .send({ shelter: shelterId, name: 'Luna', species: 'gato', sex: 'female', age: '2 años', size: 'small' })
      .expect(201);
    const animalId = create.body._id;
    expect(create.body.status).toBe('borrador');
    expect(create.body.createdByRole).toBe('protectora');

    // 2) En borrador no es visible públicamente
    const publicEmpty = await request(app).get('/api/animals').expect(200);
    expect(publicEmpty.body.items).toHaveLength(0);

    // 3) Publicar
    const publish = await request(app)
      .patch(`/api/animals/${animalId}/status`)
      .set(protectoraHeaders)
      .send({ status: 'publicado' })
      .expect(200);
    expect(publish.body.status).toBe('publicado');

    // 4) Ahora sí aparece en el listado público
    const publicList = await request(app).get('/api/animals').expect(200);
    expect(publicList.body.items).toHaveLength(1);

    // 5) Adoptante envía solicitud -> estado recibida
    const apply = await request(app)
      .post('/api/adoptions')
      .set(adopterHeaders)
      .send({ animalId })
      .expect(201);
    const adoptionId = apply.body.id;
    expect(apply.body.status).toBe('recibida');

    // 6) Protectora ve la solicitud
    const forMine = await request(app)
      .get('/api/adoptions/for-my-animals')
      .set(protectoraHeaders)
      .expect(200);
    expect(forMine.body.items).toHaveLength(1);

    // 7) Transición en_revision -> preaprobada (reserva el animal) -> aprobada
    await request(app).patch(`/api/adoptions/${adoptionId}/status`).set(protectoraHeaders).send({ status: 'en_revision' }).expect(200);

    await request(app).patch(`/api/adoptions/${adoptionId}/status`).set(protectoraHeaders).send({ status: 'preaprobada' }).expect(200);
    const reserved = await request(app).get(`/api/animals/${animalId}`).expect(200);
    expect(reserved.body.status).toBe('reservado');

    const approve = await request(app)
      .patch(`/api/adoptions/${adoptionId}/status`)
      .set(protectoraHeaders)
      .send({ status: 'aprobada' })
      .expect(200);
    expect(approve.body.status).toBe('aprobada');

    // 8) El animal queda adoptado y deja de ser público
    const finalPublic = await request(app).get('/api/animals').expect(200);
    expect(finalPublic.body.items).toHaveLength(0);
  });

  it('rechaza solicitud si el animal no está publicado', async () => {
    const create = await request(app)
      .post('/api/animals')
      .set(protectoraHeaders)
      .send({ shelter: shelterId, name: 'Toby', species: 'perro', sex: 'male', age: '1 año', size: 'medium' })
      .expect(201);
    await request(app)
      .post('/api/adoptions')
      .set(adopterHeaders)
      .send({ animalId: create.body._id })
      .expect(400);
  });
});

const otherAdopterId = new mongoose.Types.ObjectId().toHexString();
const otherAdopterHeaders = { 'x-user-id': otherAdopterId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

describe('Cancelación de la solicitud por el adoptante', () => {
  async function setupApplication() {
    const create = await request(app)
      .post('/api/animals')
      .set(protectoraHeaders)
      .send({ shelter: shelterId, name: 'Nina', species: 'perro', sex: 'female', age: '3 años', size: 'medium' })
      .expect(201);
    const animalId = create.body._id;
    await request(app).patch(`/api/animals/${animalId}/status`).set(protectoraHeaders).send({ status: 'publicado' }).expect(200);
    const apply = await request(app).post('/api/adoptions').set(adopterHeaders).send({ animalId }).expect(201);
    return { animalId, adoptionId: apply.body.id };
  }

  it('el adoptante retira su propia solicitud y libera al animal reservado', async () => {
    const { animalId, adoptionId } = await setupApplication();
    await request(app).patch(`/api/adoptions/${adoptionId}/status`).set(protectoraHeaders).send({ status: 'preaprobada' }).expect(200);
    const reserved = await request(app).get(`/api/animals/${animalId}`).expect(200);
    expect(reserved.body.status).toBe('reservado');

    const cancel = await request(app).post(`/api/adoptions/${adoptionId}/cancel`).set(adopterHeaders).expect(200);
    expect(cancel.body.status).toBe('cancelada');

    const released = await request(app).get(`/api/animals/${animalId}`).expect(200);
    expect(released.body.status).toBe('publicado');
  });

  it('otro adoptante no puede cancelar una solicitud ajena', async () => {
    const { adoptionId } = await setupApplication();
    await request(app).post(`/api/adoptions/${adoptionId}/cancel`).set(otherAdopterHeaders).expect(403);
  });

  it('no se puede cancelar una solicitud ya cerrada', async () => {
    const { adoptionId } = await setupApplication();
    await request(app).patch(`/api/adoptions/${adoptionId}/status`).set(protectoraHeaders).send({ status: 'aprobada' }).expect(200);
    await request(app).post(`/api/adoptions/${adoptionId}/cancel`).set(adopterHeaders).expect(400);
  });
});
