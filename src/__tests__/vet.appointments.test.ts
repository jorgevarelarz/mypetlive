import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const vetId = new mongoose.Types.ObjectId().toHexString();
const otherVetId = new mongoose.Types.ObjectId().toHexString();
const userId = new mongoose.Types.ObjectId().toHexString();

const vetH = { 'x-user-id': vetId, 'x-user-role': 'vet', 'x-user-verified': 'true' };
const userH = { 'x-user-id': userId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

const future = () => new Date(Date.now() + 86_400_000).toISOString();

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: vetId, name: 'Clínica Sur', email: 'vet@test.com', passwordHash: 'x', role: 'vet', profile: { orgName: 'Clínica Sur', address: { city: 'Lugo' }, vet: { specialties: ['Felina'], services: ['Vacunación'] } } },
    { _id: otherVetId, name: 'Clínica Norte', email: 'vet2@test.com', passwordHash: 'x', role: 'vet' },
    { _id: userId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
});

function createAppt(headers = userH, body: any = {}) {
  return request(app).post('/api/vet-appointments').set(headers).send({ vetId, reason: 'Revisión', requestedAt: future(), ...body });
}

describe('Citas veterinarias', () => {
  it('lista el directorio público de veterinarios', async () => {
    const res = await request(app).get('/api/vets').expect(200);
    expect(res.body.items.length).toBe(2);
    const sur = res.body.items.find((v: any) => v.name === 'Clínica Sur');
    expect(sur.city).toBe('Lugo');
    expect(sur.specialties).toContain('Felina');
  });

  it('el adoptante crea una solicitud y la ven ambas partes', async () => {
    const res = await createAppt().expect(201);
    expect(res.body.status).toBe('requested');

    const mine = await request(app).get('/api/vet-appointments/mine').set(userH).expect(200);
    expect(mine.body.items).toHaveLength(1);
    const vetView = await request(app).get('/api/vet-appointments/mine').set(vetH).expect(200);
    expect(vetView.body.items).toHaveLength(1);
  });

  it('rechaza fecha pasada y motivo vacío', async () => {
    await createAppt(userH, { requestedAt: new Date(Date.now() - 86_400_000).toISOString() }).expect(400);
    await createAppt(userH, { reason: '   ' }).expect(400);
  });

  it('el vet confirma (toma la fecha propuesta) y completa', async () => {
    const created = await createAppt().expect(201);
    const id = created.body._id;

    const confirmed = await request(app).patch(`/api/vet-appointments/${id}/status`).set(vetH).send({ status: 'confirmed' }).expect(200);
    expect(confirmed.body.status).toBe('confirmed');
    expect(confirmed.body.scheduledAt).toBeTruthy();

    const done = await request(app).patch(`/api/vet-appointments/${id}/status`).set(vetH).send({ status: 'completed', vetNotes: 'Todo correcto' }).expect(200);
    expect(done.body.status).toBe('completed');
    expect(done.body.vetNotes).toBe('Todo correcto');
  });

  it('reprogramar exige nueva fecha', async () => {
    const created = await createAppt().expect(201);
    const id = created.body._id;
    await request(app).patch(`/api/vet-appointments/${id}/status`).set(vetH).send({ status: 'rescheduled' }).expect(400);
    const ok = await request(app).patch(`/api/vet-appointments/${id}/status`).set(vetH).send({ status: 'rescheduled', scheduledAt: future() }).expect(200);
    expect(ok.body.status).toBe('rescheduled');
  });

  it('el dueño solo puede cancelar, no confirmar', async () => {
    const created = await createAppt().expect(201);
    const id = created.body._id;
    await request(app).patch(`/api/vet-appointments/${id}/status`).set(userH).send({ status: 'confirmed' }).expect(403);
    await request(app).patch(`/api/vet-appointments/${id}/status`).set(userH).send({ status: 'cancelled' }).expect(200);
  });

  it('al completar con addToHistory vuelca la cita al pasaporte del animal', async () => {
    // Animal de una protectora con código conocido.
    await User.create({ _id: new mongoose.Types.ObjectId(), name: 'Prot', email: 'p@test.com', passwordHash: 'x', role: 'landlord' });
    const shelter: any = await User.findOne({ email: 'p@test.com' }).lean();
    await Animal.create({ shelter: shelter._id, name: 'Rex', species: 'perro', sex: 'male', age: '3', size: 'medium', code: 'REX-555', status: 'publicado', createdByRole: 'protectora' });

    const created = await createAppt(userH, { animalCode: 'REX-555' }).expect(201);
    const id = created.body._id;
    await request(app).patch(`/api/vet-appointments/${id}/status`).set(vetH).send({ status: 'confirmed' }).expect(200);
    const done = await request(app).patch(`/api/vet-appointments/${id}/status`).set(vetH).send({ status: 'completed', vetNotes: 'Vacuna puesta', addToHistory: true }).expect(200);
    expect(done.body.clinicalRecordAdded).toBe(true);

    const animal: any = await Animal.findOne({ code: 'REX-555' }).lean();
    expect(animal.vetHistory).toHaveLength(1);
    expect(animal.vetHistory[0].note).toBe('Vacuna puesta');
  });

  it('rechaza transición inválida y a terceros', async () => {
    const created = await createAppt().expect(201);
    const id = created.body._id;
    await request(app).patch(`/api/vet-appointments/${id}/status`).set(vetH).send({ status: 'completed' }).expect(409); // requested→completed no permitido
    // otro vet ajeno
    await request(app).patch(`/api/vet-appointments/${id}/status`).set({ 'x-user-id': otherVetId, 'x-user-role': 'vet', 'x-user-verified': 'true' }).send({ status: 'confirmed' }).expect(403);
  });
});
