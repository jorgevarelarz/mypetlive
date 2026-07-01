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
const shelterId = new mongoose.Types.ObjectId().toHexString();

const vetH = { 'x-user-id': vetId, 'x-user-role': 'vet', 'x-user-verified': 'true' };
const userH = { 'x-user-id': userId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const shelterH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };

const future = () => new Date(Date.now() + 86_400_000).toISOString();

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: vetId, name: 'Clínica Sur', email: 'vet@test.com', passwordHash: 'x', role: 'vet', profile: { orgName: 'Clínica Sur', address: { city: 'Lugo' }, vet: { specialties: ['Felina'], services: ['Vacunación'] } } },
    { _id: otherVetId, name: 'Clínica Norte', email: 'vet2@test.com', passwordHash: 'x', role: 'vet' },
    { _id: userId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: shelterId, name: 'Protectora Lugo', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord', patitas: 50 },
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
    // Mascota del propio adoptante (dueño) con código conocido.
    await User.create({ _id: new mongoose.Types.ObjectId(), name: 'Prot', email: 'p@test.com', passwordHash: 'x', role: 'landlord' });
    const shelter: any = await User.findOne({ email: 'p@test.com' }).lean();
    await Animal.create({ shelter: shelter._id, ownerId: new mongoose.Types.ObjectId(userId), isPersonalPet: true, name: 'Rex', species: 'perro', sex: 'male', age: '3', size: 'medium', code: 'REX-555', status: 'publicado', createdByRole: 'tenant' });

    const created = await createAppt(userH, { animalCode: 'REX-555' }).expect(201);
    const id = created.body._id;
    await request(app).patch(`/api/vet-appointments/${id}/status`).set(vetH).send({ status: 'confirmed' }).expect(200);
    const done = await request(app).patch(`/api/vet-appointments/${id}/status`).set(vetH).send({ status: 'completed', vetNotes: 'Vacuna puesta', addToHistory: true }).expect(200);
    expect(done.body.clinicalRecordAdded).toBe(true);

    const animal: any = await Animal.findOne({ code: 'REX-555' }).lean();
    expect(animal.vetHistory).toHaveLength(1);
    expect(animal.vetHistory[0].note).toBe('Vacuna puesta');
  });

  it('la protectora agenda pagando con Patitas: se debitan al completar y se genera el canje', async () => {
    const created = await request(app).post('/api/vet-appointments').set(shelterH)
      .send({ vetId, reason: 'Vacunación gatos', requestedAt: future(), patitasCost: 30 }).expect(201);
    expect(created.body.patitasCost).toBe(30);
    const id = created.body._id;

    await request(app).patch(`/api/vet-appointments/${id}/status`).set(vetH).send({ status: 'confirmed' }).expect(200);
    const done = await request(app).patch(`/api/vet-appointments/${id}/status`).set(vetH).send({ status: 'completed' }).expect(200);
    expect(done.body.patitasPaid).toBe(true);
    expect(done.body.patitasCode).toBeTruthy();

    // Saldo de la protectora debitado.
    const shelter: any = await User.findById(shelterId).select('patitas').lean();
    expect(shelter.patitas).toBe(20);
    // Ledger: existe el canje al vet.
    const { PatitaTxn } = await import('../models/patitaTxn.model');
    const txn: any = await PatitaTxn.findOne({ type: 'redeem', shelterId, partnerId: vetId }).lean();
    expect(txn.amount).toBe(30);
    expect(txn.valueEur).toBeCloseTo(3.0);
  });

  it('rechaza agendar con más Patitas de las que tiene la protectora', async () => {
    await request(app).post('/api/vet-appointments').set(shelterH)
      .send({ vetId, reason: 'X', requestedAt: future(), patitasCost: 999 }).expect(400);
  });

  it('un adoptante no fija coste en Patitas (se ignora)', async () => {
    const res = await createAppt(userH, { patitasCost: 30 }).expect(201);
    expect(res.body.patitasCost).toBe(0);
  });

  it('solo permite agendar para una mascota propia', async () => {
    const otherShelter: any = await User.create({ _id: new mongoose.Types.ObjectId(), name: 'Otra', email: 'otra@test.com', passwordHash: 'x', role: 'landlord' });
    // Animal ajeno (de otra protectora): el adoptante no puede usarlo.
    await Animal.create({ shelter: otherShelter._id, name: 'Ajeno', species: 'gato', sex: 'female', age: '2', size: 'small', code: 'AJENO-1', status: 'publicado', createdByRole: 'protectora' });
    await createAppt(userH, { animalCode: 'AJENO-1' }).expect(403);

    // Mascota propia del adoptante: sí permitida.
    await Animal.create({ shelter: otherShelter._id, ownerId: new mongoose.Types.ObjectId(userId), isPersonalPet: true, name: 'Mío', species: 'perro', sex: 'male', age: '1', size: 'small', code: 'MIO-1', status: 'no_disponible', createdByRole: 'tenant' });
    const ok = await createAppt(userH, { animalCode: 'MIO-1' }).expect(201);
    expect(ok.body.animalCode).toBe('MIO-1');
  });

  it('rechaza transición inválida y a terceros', async () => {
    const created = await createAppt().expect(201);
    const id = created.body._id;
    await request(app).patch(`/api/vet-appointments/${id}/status`).set(vetH).send({ status: 'completed' }).expect(409); // requested→completed no permitido
    // otro vet ajeno
    await request(app).patch(`/api/vet-appointments/${id}/status`).set({ 'x-user-id': otherVetId, 'x-user-role': 'vet', 'x-user-verified': 'true' }).send({ status: 'confirmed' }).expect(403);
  });
});
