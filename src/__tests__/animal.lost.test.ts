import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendSms: jest.fn().mockResolvedValue(undefined),
}));

import { sendEmail } from '../utils/notification';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  process.env.FRONTEND_URL = 'https://mypetlive.es';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const shelterId = new mongoose.Types.ObjectId().toHexString();
const familyId = new mongoose.Types.ObjectId().toHexString();
const strangerId = new mongoose.Types.ObjectId().toHexString();

const shelterH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const familyH = { 'x-user-id': familyId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const strangerH = { 'x-user-id': strangerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  (sendEmail as jest.Mock).mockClear();
  await User.create([
    { _id: shelterId, name: 'Protectora Lugo', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord' },
    { _id: familyId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: strangerId, name: 'Curioso', email: 'curioso@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
});

// El aviso a la familia es best-effort a propósito: `reportSighting` responde sin
// esperarlo para que un fallo de correo no le devuelva un error a quien acaba de
// encontrar al animal. En el test hay que esperarlo, no asumirlo.
async function waitFor(assertion: () => void, timeoutMs = 2000) {
  const started = Date.now();
  for (;;) {
    try {
      assertion();
      return;
    } catch (err) {
      if (Date.now() - started > timeoutMs) throw err;
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
}

// La mascota personal de una familia adoptante: el caso real de pérdida.
async function createPersonalPet() {
  const res = await request(app)
    .post('/api/animals/personal')
    .set(familyH)
    .send({ name: 'Luna', species: 'perro', age: '3 años', sex: 'female', size: 'medium' })
    .expect(201);
  return res.body;
}

describe('Modo perdido', () => {
  it('la familia marca a su mascota como perdida y el pasaporte público lo refleja', async () => {
    const pet = await createPersonalPet();

    await request(app)
      .post(`/api/animals/${pet._id}/lost`)
      .set(familyH)
      .send({ area: 'Sada, cerca del puerto', notes: 'Lleva collar rojo' })
      .expect(200);

    const res = await request(app).get(`/api/animals/passport/${pet.code}`).expect(200);
    expect(res.body.lost.isLost).toBe(true);
    expect(res.body.lost.area).toBe('Sada, cerca del puerto');
    expect(res.body.lost.since).toBeTruthy();
  });

  it('el pasaporte en modo perdido NO filtra el contacto de la familia ni los avistamientos', async () => {
    const pet = await createPersonalPet();
    await request(app).post(`/api/animals/${pet._id}/lost`).set(familyH).send({ area: 'Sada' }).expect(200);
    await request(app)
      .post(`/api/animals/passport/${pet.code}/sighting`)
      .send({ lat: 43.35, lng: -8.27, note: 'Está en el parque', contact: '600111222' })
      .expect(201);

    const res = await request(app).get(`/api/animals/passport/${pet.code}`).expect(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('ana@test.com');
    expect(serialized).not.toContain('600111222');
    expect(serialized).not.toContain('43.35');
    expect(res.body.lost.sightings).toBeUndefined();
  });

  it('un tercero no puede marcar como perdido un animal ajeno', async () => {
    const pet = await createPersonalPet();
    await request(app).post(`/api/animals/${pet._id}/lost`).set(strangerH).send({ area: 'X' }).expect(403);
  });

  it('rechaza avistamientos si el animal no está declarado perdido', async () => {
    const pet = await createPersonalPet();
    const res = await request(app)
      .post(`/api/animals/passport/${pet.code}/sighting`)
      .send({ note: 'hola' })
      .expect(409);
    expect(res.body.error).toBe('not_lost');
  });

  it('guarda el avistamiento, avisa a la familia por correo y solo ella puede leerlo', async () => {
    const pet = await createPersonalPet();
    await request(app).post(`/api/animals/${pet._id}/lost`).set(familyH).send({ area: 'Sada' }).expect(200);

    await request(app)
      .post(`/api/animals/passport/${pet.code}/sighting`)
      .send({ lat: 43.3568, lng: -8.2776, accuracy: 25, note: 'Bebiendo en la fuente', contact: 'vecino@test.com' })
      .expect(201);

    // El aviso sale hacia el correo de la familia, no del que lo encuentra.
    await waitFor(() => expect(sendEmail).toHaveBeenCalled());
    const [to, subject, body] = (sendEmail as jest.Mock).mock.calls[0];
    expect(to).toBe('ana@test.com');
    expect(subject).toContain('Luna');
    expect(body).toContain('43.3568');
    expect(body).toContain('vecino@test.com');

    const mine = await request(app).get(`/api/animals/${pet._id}/sightings`).set(familyH).expect(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].lat).toBeCloseTo(43.3568);
    expect(mine.body.items[0].accuracy).toBe(25);

    await request(app).get(`/api/animals/${pet._id}/sightings`).set(strangerH).expect(403);
  });

  it('acepta un aviso sin ubicación pero rechaza el vacío y las coordenadas imposibles', async () => {
    const pet = await createPersonalPet();
    await request(app).post(`/api/animals/${pet._id}/lost`).set(familyH).send({}).expect(200);

    await request(app)
      .post(`/api/animals/passport/${pet.code}/sighting`)
      .send({ note: 'Lo vi pero no puedo compartir dónde estoy' })
      .expect(201);

    await request(app).post(`/api/animals/passport/${pet.code}/sighting`).send({}).expect(400);

    const res = await request(app)
      .post(`/api/animals/passport/${pet.code}/sighting`)
      .send({ lat: 999, lng: 0 })
      .expect(400);
    expect(res.body.error).toBe('invalid_location');
  });

  it('marcar perdido dos veces actualiza la zona pero no reinicia el reloj', async () => {
    const pet = await createPersonalPet();
    const first = await request(app).post(`/api/animals/${pet._id}/lost`).set(familyH).send({ area: 'Sada' }).expect(200);
    const since = first.body.lost.since;

    await new Promise(resolve => setTimeout(resolve, 10));
    const second = await request(app).post(`/api/animals/${pet._id}/lost`).set(familyH).send({ area: 'Oleiros' }).expect(200);

    expect(second.body.lost.area).toBe('Oleiros');
    expect(new Date(second.body.lost.since).getTime()).toBe(new Date(since).getTime());
  });

  it('al aparecer se cierra el episodio pero se conservan los avistamientos', async () => {
    const pet = await createPersonalPet();
    await request(app).post(`/api/animals/${pet._id}/lost`).set(familyH).send({ area: 'Sada' }).expect(200);
    await request(app)
      .post(`/api/animals/passport/${pet.code}/sighting`)
      .send({ note: 'Lo vi en la playa' })
      .expect(201);

    await request(app).post(`/api/animals/${pet._id}/found`).set(familyH).expect(200);

    const passport = await request(app).get(`/api/animals/passport/${pet.code}`).expect(200);
    expect(passport.body.lost.isLost).toBe(false);

    const mine = await request(app).get(`/api/animals/${pet._id}/sightings`).set(familyH).expect(200);
    expect(mine.body.items).toHaveLength(1);

    const stored = await Animal.findById(pet._id).lean();
    expect(stored.lost.isLost).toBe(false);
    expect(stored.lost.sightings).toHaveLength(1);
  });

  it('la protectora puede marcar perdido un animal suyo', async () => {
    const created = await request(app)
      .post('/api/animals')
      .set(shelterH)
      .send({ shelter: shelterId, name: 'Milo', species: 'gato', sex: 'male', age: '2 años', size: 'small', status: 'publicado' })
      .expect(201);

    await request(app).post(`/api/animals/${created.body._id}/lost`).set(shelterH).send({ area: 'Lugo' }).expect(200);
    const res = await request(app).get(`/api/animals/passport/${created.body.code}`).expect(200);
    expect(res.body.lost.isLost).toBe(true);
  });
});
