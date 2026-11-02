import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendSms: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/push', () => ({ sendPushToUser: jest.fn().mockResolvedValue(undefined) }));

// Corregir o borrar una entrada del historial de salud (2 nov 2026): la familia
// lo suyo, la clínica lo suyo, y nadie lo de los demás.

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let ensureHealthEntryIds: () => Promise<number>;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  process.env.PET_INVITE_HOURLY_LIMIT = '1000';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  const animalModel = await import('../models/animal.model');
  Animal = animalModel.Animal;
  ensureHealthEntryIds = animalModel.ensureHealthEntryIds;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const ownerId = new mongoose.Types.ObjectId().toHexString();
const partnerId = new mongoose.Types.ObjectId().toHexString();
const strangerId = new mongoose.Types.ObjectId().toHexString();
const vetId = new mongoose.Types.ObjectId().toHexString();
const H = (id: string, role = 'tenant') => ({ 'x-user-id': id, 'x-user-role': role, 'x-user-verified': 'true' });

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) await mongoose.connection.db.dropDatabase();
  await User.create([
    { _id: ownerId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: partnerId, name: 'Pablo', email: 'pablo@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: strangerId, name: 'Curioso', email: 'curioso@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: vetId, name: 'CentroVet', email: 'vet@test.com', passwordHash: 'x', role: 'vet' },
  ]);
});

async function petWithVaccine() {
  const pet = (await request(app).post('/api/animals/personal').set(H(ownerId)).send({ name: 'Luna', species: 'perro', age: '3 años' }).expect(201)).body;
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ category: 'vaccine', note: 'Rabbia', nextDueAt: soon }).expect(201);
  const doc = await Animal.findById(pet._id).lean();
  return { pet, entry: doc.healthHistory[0] };
}

describe('Corregir el historial de salud', () => {
  it('cada entrada nueva lleva su id y quién la apuntó', async () => {
    const { entry } = await petWithVaccine();
    expect(entry._id).toBeTruthy();
    expect(entry.byRole).toBe('family');
  });

  it('la familia corrige el texto, el tipo y la próxima fecha; el aviso se rearma', async () => {
    const { pet, entry } = await petWithVaccine();
    await Animal.updateOne({ _id: pet._id }, { $set: { 'healthHistory.0.reminderSentAt': new Date() } });
    const next = new Date(Date.now() + 60 * 86_400_000).toISOString();
    await request(app).patch(`/api/animals/${pet.code}/health/${entry._id}`).set(H(ownerId))
      .send({ note: 'Rabia', category: 'deworming', nextDueAt: next }).expect(200);
    const doc = await Animal.findById(pet._id).lean();
    expect(doc.healthHistory[0]).toMatchObject({ notes: 'Rabia', type: 'deworming' });
    expect(new Date(doc.healthHistory[0].nextDueAt).toISOString()).toBe(next);
    expect(doc.healthHistory[0].reminderSentAt).toBeUndefined();
  });

  it('quitar la próxima fecha deja la entrada sin aviso', async () => {
    const { pet, entry } = await petWithVaccine();
    await request(app).patch(`/api/animals/${pet.code}/health/${entry._id}`).set(H(ownerId)).send({ nextDueAt: null }).expect(200);
    const doc = await Animal.findById(pet._id).lean();
    expect(doc.healthHistory[0].nextDueAt).toBeUndefined();
  });

  it('borrarla la quita del pasaporte público', async () => {
    const { pet, entry } = await petWithVaccine();
    const res = await request(app).delete(`/api/animals/${pet.code}/health/${entry._id}`).set(H(ownerId)).expect(200);
    expect(res.body.health.healthMilestones).toBe(0);
    const pass = await request(app).get(`/api/animals/passport/${pet.code}`).expect(200);
    expect(pass.body.timeline.some((t: any) => t.type === 'health')).toBe(false);
  });

  it('con quien se comparte la mascota también puede', async () => {
    const { pet, entry } = await petWithVaccine();
    const { token } = (await request(app).post(`/api/animals/${pet._id}/family/invites`).set(H(ownerId)).send({ email: 'pablo@test.com' }).expect(201)).body;
    await request(app).post('/api/pet-invites/accept').set(H(partnerId)).send({ token }).expect(200);
    await request(app).delete(`/api/animals/${pet.code}/health/${entry._id}`).set(H(partnerId)).expect(200);
  });

  it('nadie más puede tocarla', async () => {
    const { pet, entry } = await petWithVaccine();
    await request(app).patch(`/api/animals/${pet.code}/health/${entry._id}`).set(H(strangerId)).send({ note: 'x' }).expect(403);
    await request(app).delete(`/api/animals/${pet.code}/health/${entry._id}`).set(H(strangerId)).expect(403);
  });

  it('lo que apuntó la clínica no lo cambia la familia; la clínica sí', async () => {
    const { pet } = await petWithVaccine();
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(vetId, 'vet')).send({ category: 'vaccine', note: 'Polivalente' }).expect(201);
    const doc = await Animal.findById(pet._id).lean();
    const vetEntry = doc.healthHistory.find((h: any) => h.notes === 'Polivalente');
    expect(vetEntry.byRole).toBe('vet');
    const res = await request(app).delete(`/api/animals/${pet.code}/health/${vetEntry._id}`).set(H(ownerId)).expect(403);
    expect(res.body.error).toBe('vet_record');
    await request(app).patch(`/api/animals/${pet.code}/health/${vetEntry._id}`).set(H(vetId, 'vet')).send({ note: 'Polivalente (lote 22)' }).expect(200);
  });

  it('no deja datos imposibles', async () => {
    const { pet, entry } = await petWithVaccine();
    const url = `/api/animals/${pet.code}/health/${entry._id}`;
    await request(app).patch(url).set(H(ownerId)).send({ note: '  ' }).expect(400);
    await request(app).patch(url).set(H(ownerId)).send({ category: 'visit' }).expect(400);
    await request(app).patch(url).set(H(ownerId)).send({ nextDueAt: '2020-01-01' }).expect(400);
    await request(app).patch(url).set(H(ownerId)).send({ date: new Date(Date.now() + 10 * 86_400_000).toISOString() }).expect(400);
    await request(app).patch(`/api/animals/${pet.code}/health/${new mongoose.Types.ObjectId()}`).set(H(ownerId)).send({ note: 'x' }).expect(404);
  });

  it('las entradas viejas reciben id y autor al arrancar, sin tocar las que ya los tienen', async () => {
    const { pet, entry } = await petWithVaccine();
    // Dos entradas «de antes»: sin _id ni byRole, una de la familia y otra de la clínica.
    await Animal.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(pet._id)) }, {
      $push: { healthHistory: { $each: [
        { date: new Date(), type: 'deworming', notes: 'Vieja familia', vetId: new mongoose.Types.ObjectId(ownerId) },
        { date: new Date(), type: 'vaccine', notes: 'Vieja clínica', vetId: new mongoose.Types.ObjectId(vetId) },
      ] } } as any,
    });
    expect(await ensureHealthEntryIds()).toBe(1);
    const doc = await Animal.findById(pet._id).lean();
    const byNote = Object.fromEntries(doc.healthHistory.map((h: any) => [h.notes, h]));
    expect(String(byNote.Rabbia._id)).toBe(String(entry._id));
    expect(byNote['Vieja familia']).toMatchObject({ byRole: 'family' });
    expect(byNote['Vieja clínica']).toMatchObject({ byRole: 'vet' });
    expect(byNote['Vieja familia']._id).toBeTruthy();
    expect(await ensureHealthEntryIds()).toBe(0);
  });

  it('medicación es un tipo más del historial, con su título en el pasaporte', async () => {
    const { pet } = await petWithVaccine();
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ category: 'medication', note: 'Antibiótico 7 días' }).expect(201);
    const pass = await request(app).get(`/api/animals/passport/${pet.code}`).expect(200);
    const med = pass.body.timeline.find((t: any) => t.kind === 'medication');
    expect(med).toMatchObject({ title: 'Medicación', detail: 'Antibiótico 7 días' });
  });
});

describe('Sus datos de salud', () => {
  it('la familia apunta el peso y la condición; el peso lleva su fecha y se puede quitar', async () => {
    const { pet } = await petWithVaccine();
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ weightKg: 24.5, bodyCondition: 'bueno' }).expect(200);
    let doc = await Animal.findById(pet._id).lean();
    expect(doc).toMatchObject({ weightKg: 24.5, bodyCondition: 'bueno' });
    expect(doc.weightAt).toBeTruthy();
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ weightKg: null, bodyCondition: null }).expect(200);
    doc = await Animal.findById(pet._id).lean();
    expect(doc.weightKg).toBeUndefined();
    expect(doc.bodyCondition).toBeNull();
  });

  it('no acepta pesos ni condiciones imposibles', async () => {
    const { pet } = await petWithVaccine();
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ weightKg: -3 }).expect(400);
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ weightKg: 900 }).expect(400);
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ bodyCondition: 'gordito' }).expect(400);
  });
});

