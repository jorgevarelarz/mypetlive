import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

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

const vetId = new mongoose.Types.ObjectId().toHexString();
const ownerId = new mongoose.Types.ObjectId().toHexString();
const vetH = { 'x-user-id': vetId, 'x-user-role': 'vet', 'x-user-verified': 'true' };
const ownerH = { 'x-user-id': ownerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: vetId, name: 'Clínica Sur', email: 'vet@test.com', passwordHash: 'x', role: 'vet' },
    { _id: ownerId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
});

async function getFeedToken(): Promise<string> {
  const res = await request(app).get('/api/vets/me/calendar-feed').set(vetH).expect(200);
  expect(res.body.url).toMatch(/\/api\/vets\/calendar\/[a-f0-9]{48}\.ics$/);
  return res.body.url.match(/calendar\/([a-f0-9]{48})\.ics$/)[1];
}

async function bookAppointment() {
  const res = await request(app)
    .post('/api/vet-appointments')
    .set(ownerH)
    .send({ vetId, reason: 'Vacuna anual', requestedAt: new Date(Date.now() + 86400000).toISOString() })
    .expect(201);
  return res.body._id as string;
}

describe('Feed iCal de la agenda del vet', () => {
  it('solo el vet puede obtener su URL de feed; es estable entre llamadas', async () => {
    await request(app).get('/api/vets/me/calendar-feed').set(ownerH).expect(403);
    const t1 = await getFeedToken();
    const t2 = await getFeedToken();
    expect(t1).toBe(t2);
  });

  it('sirve un ICS con la cita y refleja su estado (tentativa → confirmada → cancelada)', async () => {
    const token = await getFeedToken();
    const apptId = await bookAppointment();

    let res = await request(app).get(`/api/vets/calendar/${token}.ics`).expect(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.text).toContain(`UID:${apptId}@mypetlive.es`);
    expect(res.text).toContain('SUMMARY:Cita — Ana');
    expect(res.text).toContain('STATUS:TENTATIVE');

    await request(app).patch(`/api/vet-appointments/${apptId}/status`).set(vetH).send({ status: 'confirmed' }).expect(200);
    res = await request(app).get(`/api/vets/calendar/${token}.ics`).expect(200);
    expect(res.text).toContain('STATUS:CONFIRMED');

    await request(app).patch(`/api/vet-appointments/${apptId}/status`).set(vetH).send({ status: 'cancelled' }).expect(200);
    res = await request(app).get(`/api/vets/calendar/${token}.ics`).expect(200);
    expect(res.text).toContain('STATUS:CANCELLED');
  });

  it('un token inválido devuelve 404 y rotar invalida la URL anterior', async () => {
    const token = await getFeedToken();
    await request(app).get(`/api/vets/calendar/${'0'.repeat(48)}.ics`).expect(404);

    const rot = await request(app).post('/api/vets/me/calendar-feed/rotate').set(vetH).expect(200);
    const newToken = rot.body.url.match(/calendar\/([a-f0-9]{48})\.ics$/)[1];
    expect(newToken).not.toBe(token);
    await request(app).get(`/api/vets/calendar/${token}.ics`).expect(404);
    await request(app).get(`/api/vets/calendar/${newToken}.ics`).expect(200);
  });

  it('el token no se filtra en el directorio público de vets', async () => {
    const token = await getFeedToken();
    const res = await request(app).get('/api/vets').expect(200);
    expect(JSON.stringify(res.body)).not.toContain(token);
  });
});
