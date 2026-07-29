import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { User } from '../models/user.model';
import { Verification } from '../models/verification.model';
import { Animal } from '../models/animal.model';

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

// Deja una solicitud recién creada sobre un animal publicado.
async function newApplication() {
  const create = await request(app)
    .post('/api/animals')
    .set(protectoraH)
    .send({ shelter: shelterId, name: 'Luna', species: 'gato', sex: 'female', age: '2 años', size: 'small' })
    .expect(201);
  const animalId = create.body._id;
  await request(app).patch(`/api/animals/${animalId}/status`).set(protectoraH).send({ status: 'publicado' }).expect(200);
  const apply = await request(app).post('/api/adoptions').set(adopterH).send({ animalId }).expect(201);
  return { animalId, adoptionId: apply.body.id };
}

const setStatus = (id: string, status: string, headers: Record<string, string> = protectoraH) =>
  request(app).patch(`/api/adoptions/${id}/status`).set(headers).send({ status });

describe('Máquina de estados de la adopción', () => {
  it('el camino normal sigue funcionando', async () => {
    const { adoptionId, animalId } = await newApplication();
    await setStatus(adoptionId, 'en_revision').expect(200);
    await setStatus(adoptionId, 'preaprobada').expect(200);
    await setStatus(adoptionId, 'aprobada').expect(200);

    // Un animal adoptado ya no es visible en el detalle público, así que se
    // comprueba en la base.
    const animal: any = await Animal.findById(animalId).lean();
    expect(animal.status).toBe('adoptado');
  });

  it('una adopción aprobada no se puede rechazar, y el animal sigue siendo del adoptante', async () => {
    const { adoptionId, animalId } = await newApplication();
    await setStatus(adoptionId, 'en_revision').expect(200);
    await setStatus(adoptionId, 'preaprobada').expect(200);
    await setStatus(adoptionId, 'aprobada').expect(200);

    // Este era el agujero: se aceptaba, la solicitud quedaba rechazada y el
    // traspaso del animal no se revertía.
    const res = await setStatus(adoptionId, 'rechazada').expect(409);
    expect(res.body.error).toBe('adoption_already_closed');
    expect(res.body.allowed).toEqual([]);

    const animal: any = await Animal.findById(animalId).lean();
    expect(animal.status).toBe('adoptado');
    expect(String(animal.ownerId)).toBe(adopterId);

    const after = await request(app).get(`/api/adoptions/${adoptionId}`).set(protectoraH).expect(200);
    expect(after.body.status).toBe('aprobada');
  });

  it('el admin tampoco está exento: el destrozo en los datos sería el mismo', async () => {
    const { adoptionId } = await newApplication();
    await setStatus(adoptionId, 'en_revision').expect(200);
    await setStatus(adoptionId, 'preaprobada').expect(200);
    await setStatus(adoptionId, 'aprobada', adminH).expect(200);

    const res = await setStatus(adoptionId, 'rechazada', adminH).expect(409);
    expect(res.body.error).toBe('adoption_already_closed');
  });

  it('no se puede aprobar saltándose la preaprobación', async () => {
    const { adoptionId } = await newApplication();
    const res = await setStatus(adoptionId, 'aprobada').expect(409);
    expect(res.body.error).toBe('invalid_transition');
    expect(res.body.from).toBe('recibida');
    expect(res.body.allowed).toEqual(['en_revision', 'info_adicional', 'rechazada']);
  });

  it('rechazar y cancelar también cierran el proceso', async () => {
    const a = await newApplication();
    await setStatus(a.adoptionId, 'rechazada').expect(200);
    await setStatus(a.adoptionId, 'en_revision').expect(409);

    const b = await newApplication();
    await setStatus(b.adoptionId, 'en_revision').expect(200);
    await setStatus(b.adoptionId, 'preaprobada').expect(200);
    await setStatus(b.adoptionId, 'cancelada').expect(200);
    await setStatus(b.adoptionId, 'aprobada').expect(409);
  });

  it('aprobar una candidatura cierra las demás del mismo animal', async () => {
    const { animalId, adoptionId } = await newApplication();
    // Un segundo adoptante sobre el mismo animal.
    const otherId = new mongoose.Types.ObjectId().toHexString();
    await User.create({ _id: otherId, name: 'Luis', email: 'luis@test.com', passwordHash: 'x', role: 'tenant' });
    const otherH = { 'x-user-id': otherId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
    const other = await request(app).post('/api/adoptions').set(otherH).send({ animalId }).expect(201);
    await setStatus(other.body.id, 'en_revision').expect(200);

    await setStatus(adoptionId, 'en_revision').expect(200);
    await setStatus(adoptionId, 'preaprobada').expect(200);
    await setStatus(adoptionId, 'aprobada').expect(200);

    // Antes se quedaba abierta para siempre, con el adoptante esperando una
    // respuesta que no iba a llegar.
    const sibling = await request(app).get(`/api/adoptions/${other.body.id}`).set(protectoraH).expect(200);
    expect(sibling.body.status).toBe('rechazada');
  });

  it('cerrar las hermanas no toca las de otros animales', async () => {
    const a = await newApplication();
    const b = await newApplication();
    await setStatus(a.adoptionId, 'en_revision').expect(200);
    await setStatus(a.adoptionId, 'preaprobada').expect(200);
    await setStatus(a.adoptionId, 'aprobada').expect(200);

    const untouched = await request(app).get(`/api/adoptions/${b.adoptionId}`).set(protectoraH).expect(200);
    expect(untouched.body.status).toBe('recibida');
  });

  it('rechazar libera el animal reservado, como antes', async () => {
    const { adoptionId, animalId } = await newApplication();
    await setStatus(adoptionId, 'en_revision').expect(200);
    await setStatus(adoptionId, 'preaprobada').expect(200);
    const reserved = await request(app).get(`/api/animals/${animalId}`).expect(200);
    expect(reserved.body.status).toBe('reservado');

    await setStatus(adoptionId, 'rechazada').expect(200);
    const freed = await request(app).get(`/api/animals/${animalId}`).expect(200);
    expect(freed.body.status).toBe('publicado');
  });
});
