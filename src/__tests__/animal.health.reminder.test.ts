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
let sendHealthDueReminders: (now?: Date) => Promise<number>;

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
  ({ sendHealthDueReminders } = await import('../jobs/reminders'));
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const familyId = new mongoose.Types.ObjectId().toHexString();
const strangerId = new mongoose.Types.ObjectId().toHexString();
const vetId = new mongoose.Types.ObjectId().toHexString();

const familyH = { 'x-user-id': familyId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const strangerH = { 'x-user-id': strangerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const vetH = { 'x-user-id': vetId, 'x-user-role': 'vet', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  (sendEmail as jest.Mock).mockClear();
  await User.create([
    { _id: familyId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: strangerId, name: 'Curioso', email: 'curioso@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: vetId, name: 'Clínica', email: 'vet@test.com', passwordHash: 'x', role: 'vet' },
  ]);
});

async function createPet() {
  const res = await request(app)
    .post('/api/animals/personal')
    .set(familyH)
    .send({ name: 'Luna', species: 'perro', age: '3 años', sex: 'female', size: 'medium' })
    .expect(201);
  return res.body;
}

const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

describe('quién puede apuntar salud en el pasaporte', () => {
  it('la familia puede apuntar la vacuna de su propia mascota', async () => {
    const pet = await createPet();
    const res = await request(app)
      .post(`/api/animals/${pet.code}/health`)
      .set(familyH)
      .send({ category: 'vaccine', note: 'Trivalente' })
      .expect(201);
    expect(res.body.health.healthMilestones).toBe(1);
  });

  it('un desconocido no puede apuntar en la mascota de otro', async () => {
    const pet = await createPet();
    await request(app)
      .post(`/api/animals/${pet.code}/health`)
      .set(strangerH)
      .send({ category: 'vaccine', note: 'Trivalente' })
      .expect(403);
  });

  it('el veterinario sigue pudiendo, aunque no sea la familia', async () => {
    const pet = await createPet();
    await request(app)
      .post(`/api/animals/${pet.code}/health`)
      .set(vetH)
      .send({ category: 'checkup', note: 'Revisión anual' })
      .expect(201);
  });

  // En NODE_ENV=test `authenticate` inyecta un usuario falso cuando no hay
  // cabecera (ver auth.middleware), así que una petición pelada no da 401 como
  // daría en producción: da 403, porque ese usuario inventado tampoco es la
  // familia del animal. Lo que este caso fija es justo eso — que el camino por
  // defecto no escribe en el pasaporte de nadie.
  it('el usuario por defecto de los tests tampoco puede apuntar', async () => {
    const pet = await createPet();
    await request(app)
      .post(`/api/animals/${pet.code}/health`)
      .send({ category: 'vaccine', note: 'Trivalente' })
      .expect(403);
  });
});

describe('cuándo toca repetirlo', () => {
  it('una vacuna sin fecha explícita se repite al año', async () => {
    const pet = await createPet();
    const res = await request(app)
      .post(`/api/animals/${pet.code}/health`)
      .set(familyH)
      .send({ category: 'vaccine', note: 'Trivalente' })
      .expect(201);
    const meses = (new Date(res.body.nextDueAt).getTime() - Date.now()) / (30 * 24 * 3600 * 1000);
    expect(meses).toBeGreaterThan(11);
    expect(meses).toBeLessThan(13);
  });

  it('una desparasitación se repite a los tres meses', async () => {
    const pet = await createPet();
    const res = await request(app)
      .post(`/api/animals/${pet.code}/health`)
      .set(familyH)
      .send({ category: 'deworming', note: 'Pipeta' })
      .expect(201);
    const meses = (new Date(res.body.nextDueAt).getTime() - Date.now()) / (30 * 24 * 3600 * 1000);
    expect(meses).toBeGreaterThan(2.5);
    expect(meses).toBeLessThan(3.5);
  });

  it('una cirugía no genera recordatorio: no se repite por calendario', async () => {
    const pet = await createPet();
    const res = await request(app)
      .post(`/api/animals/${pet.code}/health`)
      .set(familyH)
      .send({ category: 'surgery', note: 'Esterilización' })
      .expect(201);
    expect(res.body.nextDueAt).toBeNull();
  });

  it('quien apunta puede renunciar al recordatorio con nextDueAt: null', async () => {
    const pet = await createPet();
    const res = await request(app)
      .post(`/api/animals/${pet.code}/health`)
      .set(familyH)
      .send({ category: 'vaccine', note: 'Trivalente', nextDueAt: null })
      .expect(201);
    expect(res.body.nextDueAt).toBeNull();
  });

  it('rechaza una fecha pasada', async () => {
    const pet = await createPet();
    await request(app)
      .post(`/api/animals/${pet.code}/health`)
      .set(familyH)
      .send({ category: 'vaccine', note: 'Trivalente', nextDueAt: dias(-1).toISOString() })
      .expect(400);
  });

  it('rechaza una fecha que no lo es', async () => {
    const pet = await createPet();
    await request(app)
      .post(`/api/animals/${pet.code}/health`)
      .set(familyH)
      .send({ category: 'vaccine', note: 'Trivalente', nextDueAt: 'el martes' })
      .expect(400);
  });
});

describe('el aviso de lo que toca', () => {
  async function petConVacunaEn(dentroDeDias: number) {
    const pet = await createPet();
    await Animal.updateOne(
      { _id: pet._id },
      { $set: { healthHistory: [{ date: new Date(), type: 'vaccine', notes: 'Trivalente', nextDueAt: dias(dentroDeDias) }] } },
    );
    return pet;
  }

  it('avisa cuando faltan menos de siete días', async () => {
    await petConVacunaEn(3);
    const enviados = await sendHealthDueReminders();
    expect(enviados).toBe(1);
    const [to, subject] = (sendEmail as jest.Mock).mock.calls[0];
    expect(to).toBe('ana@test.com');
    expect(subject).toContain('Luna');
  });

  it('no avisa con un mes de antelación', async () => {
    await petConVacunaEn(30);
    expect(await sendHealthDueReminders()).toBe(0);
    expect(sendEmail as jest.Mock).not.toHaveBeenCalled();
  });

  it('no repite el aviso en la siguiente pasada', async () => {
    await petConVacunaEn(3);
    expect(await sendHealthDueReminders()).toBe(1);
    (sendEmail as jest.Mock).mockClear();
    expect(await sendHealthDueReminders()).toBe(0);
    expect(sendEmail as jest.Mock).not.toHaveBeenCalled();
  });

  it('manda un solo correo aunque le toquen dos cosas la misma semana', async () => {
    const pet = await createPet();
    await Animal.updateOne(
      { _id: pet._id },
      { $set: { healthHistory: [
        { date: new Date(), type: 'vaccine', notes: 'Trivalente', nextDueAt: dias(2) },
        { date: new Date(), type: 'deworming', notes: 'Pipeta', nextDueAt: dias(5) },
      ] } },
    );
    expect(await sendHealthDueReminders()).toBe(1);
    expect(sendEmail as jest.Mock).toHaveBeenCalledTimes(1);
    const cuerpo = (sendEmail as jest.Mock).mock.calls[0][2];
    expect(cuerpo).toContain('vacuna');
    expect(cuerpo).toContain('desparasitación');
  });

  it('también avisa de lo que ya se pasó de fecha', async () => {
    await petConVacunaEn(-10);
    expect(await sendHealthDueReminders()).toBe(1);
  });

  it('ignora los hitos sin fecha de repetición', async () => {
    const pet = await createPet();
    await Animal.updateOne(
      { _id: pet._id },
      { $set: { healthHistory: [{ date: new Date(), type: 'surgery', notes: 'Esterilización' }] } },
    );
    expect(await sendHealthDueReminders()).toBe(0);
  });
});
