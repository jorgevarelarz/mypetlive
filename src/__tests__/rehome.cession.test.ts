import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { startMongoMemoryReplicaSet } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/push', () => ({ sendPushToUser: jest.fn().mockResolvedValue(undefined), pushConfigured: false }));

// Particulares que ceden un animal suyo (Ley 7/2023): solo usuarios activados
// por el admin, microchip obligatorio, 8 semanas, y se cierra con contrato.

let app: any;
let mongo: MongoMemoryReplSet | undefined;
let User: any;
let Animal: any;

beforeAll(async () => {
  mongo = await startMongoMemoryReplicaSet();
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

const id = () => new mongoose.Types.ObjectId().toHexString();
const giver = id(), taker = id(), other = id(), admin = id(), stranger = id();
const H = (uid: string, role = 'tenant') => ({ 'x-user-id': uid, 'x-user-role': role, 'x-user-verified': 'true' });
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const listing = (extra: any = {}) => ({
  name: 'Nube', species: 'cat', sex: 'female', birthDate: daysAgo(80), microchip: '941 000 029 384 175',
  city: 'Oleiros', description: 'Cariñosa', images: ['/uploads/nube.webp'], declaration: true, ...extra,
});

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) await mongoose.connection.db.dropDatabase();
  await User.create([
    { _id: giver, name: 'Carmen Ruiz', email: 'carmen@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: taker, name: 'Sara Gil', email: 'sara@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: other, name: 'Iván Paz', email: 'ivan@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: admin, name: 'Admin', email: 'admin@test.com', passwordHash: 'x', role: 'admin' },
    { _id: stranger, name: 'Otro', email: 'otro@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
});

const enable = () => request(app).patch(`/api/rehome/admin/users/${giver}`).set(H(admin, 'admin')).send({ enabled: true }).expect(200);

async function published() {
  await enable();
  const res = await request(app).post('/api/rehome/animals').set(H(giver)).send(listing()).expect(201);
  return String(res.body._id);
}

describe('Cesión entre particulares', () => {
  it('solo publica quien el admin ha activado, y solo el admin activa', async () => {
    await request(app).post('/api/rehome/animals').set(H(giver)).send(listing()).expect(403);
    await request(app).patch(`/api/rehome/admin/users/${giver}`).set(H(stranger)).send({ enabled: true }).expect(403);
    expect((await request(app).get('/api/rehome/status').set(H(giver)).expect(200)).body.enabled).toBe(false);
    await enable();
    expect((await request(app).get('/api/rehome/status').set(H(giver)).expect(200)).body.enabled).toBe(true);
    await request(app).post('/api/rehome/animals').set(H(giver)).send(listing()).expect(201);
  });

  it('exige microchip de 15 cifras, declaración, foto y fecha en perros y gatos', async () => {
    await enable();
    const post = (b: any) => request(app).post('/api/rehome/animals').set(H(giver)).send(listing(b));
    expect((await post({ microchip: '1234' }).expect(400)).body.error).toBe('invalid_microchip');
    expect((await post({ declaration: false }).expect(400)).body.error).toBe('declaration_required');
    expect((await post({ images: [] }).expect(400)).body.error).toBe('photo_required');
    expect((await post({ birthDate: undefined }).expect(400)).body.error).toBe('birth_date_required');
    await post({}).expect(201);
    // El mismo chip no se anuncia dos veces.
    expect((await post({}).expect(409)).body.error).toBe('microchip_already_listed');
  });

  it('sale en Compañeros sin el correo de quien cede y con el chip recortado', async () => {
    const animalId = await published();
    const list = await request(app).get('/api/animals').expect(200);
    const item = list.body.items.find((a: any) => String(a._id) === animalId);
    expect(item.createdByRole).toBe('particular');
    expect(item.cession).toEqual(expect.objectContaining({ microchipLast4: '4175' }));
    expect(item.cession.microchip).toBeUndefined();
    const detail = await request(app).get(`/api/animals/${animalId}`).set(H(stranger)).expect(200);
    expect(detail.body.shelter.email).toBeUndefined();
    expect(detail.body.shelter.name).toBe('Carmen Ruiz');
  });

  it('flujo completo: solicitud, elegir, contrato firmado por los dos y traspaso', async () => {
    const animalId = await published();
    // Nadie se pide su propio animal.
    expect((await request(app).post('/api/adoptions').set(H(giver)).send({ animalId }).expect(400)).body.error).toBe('own_animal');
    const a1 = (await request(app).post('/api/adoptions').set(H(taker)).send({ animalId }).expect(201)).body.id;
    const a2 = (await request(app).post('/api/adoptions').set(H(other)).send({ animalId }).expect(201)).body.id;

    const mine = await request(app).get('/api/rehome/animals').set(H(giver)).expect(200);
    expect(mine.body.items[0].requests.map((r: any) => r.adopterName)).toEqual(['Sara Gil', 'Iván Paz']);

    // Solo quien cede elige.
    await request(app).post(`/api/rehome/adoptions/${a1}/choose`).set(H(stranger)).expect(404);
    await request(app).post(`/api/rehome/adoptions/${a1}/choose`).set(H(giver)).expect(200);
    expect((await request(app).post(`/api/rehome/adoptions/${a2}/choose`).set(H(giver)).expect(409)).body.error).toBe('someone_else_chosen');
    expect((await Animal.findById(animalId).lean()).status).toBe('reservado');

    const contract = await request(app).get(`/api/rehome/contracts/${a1}`).set(H(taker)).expect(200);
    expect(contract.body.text).toContain('941000029384175');
    expect(contract.body.text).toContain('GRATUITA');
    expect(contract.body.role).toBe('to');
    await request(app).get(`/api/rehome/contracts/${a1}`).set(H(other)).expect(404);

    // Firma con nombre y apellido; no dos veces.
    await request(app).post(`/api/rehome/contracts/${a1}/sign`).set(H(taker)).send({ fullName: 'Sara' }).expect(400);
    await request(app).post(`/api/rehome/contracts/${a1}/sign`).set(H(taker)).send({ fullName: 'Sara Gil Pérez' }).expect(200);
    await request(app).post(`/api/rehome/contracts/${a1}/sign`).set(H(taker)).send({ fullName: 'Sara Gil Pérez' }).expect(409);
    await request(app).post(`/api/rehome/contracts/${a1}/title-changed`).set(H(giver)).expect(409);
    const done = await request(app).post(`/api/rehome/contracts/${a1}/sign`).set(H(giver)).send({ fullName: 'Carmen Ruiz López' }).expect(200);
    expect(done.body.completed).toBe(true);

    // Pasa a «Mi mascota» de Sara y la otra solicitud se cierra.
    const animal = await Animal.findById(animalId).lean();
    expect(animal.status).toBe('adoptado');
    expect(String(animal.ownerId)).toBe(taker);
    expect(animal.isPersonalPet).toBe(true);
    const mine2 = await request(app).get('/api/rehome/animals').set(H(giver)).expect(200);
    const reqs = mine2.body.items[0].requests;
    expect(reqs.find((r: any) => r.adoptionId === a1).status).toBe('aprobada');
    expect(reqs.find((r: any) => r.adoptionId === a2).status).toBe('rechazada');

    // El chat cuenta la historia y recuerda el cambio de titular.
    const [conv] = (await request(app).get('/api/chat/conversations').set(H(taker)).expect(200)).body;
    expect(conv.context.cession).toBe(true);
    const msgs = (await request(app).get(`/api/chat/${conv._id}/messages`).set(H(taker)).expect(200)).body.map((m: any) => m.systemCode);
    expect(msgs).toEqual(expect.arrayContaining(['cession.contract', 'cession.signed', 'cession.title_change']));
    await request(app).post(`/api/rehome/contracts/${a1}/title-changed`).set(H(giver)).expect(200);
  });

  it('no deja ceder perros ni gatos de menos de 8 semanas', async () => {
    await enable();
    const res = await request(app).post('/api/rehome/animals').set(H(giver)).send(listing({ birthDate: daysAgo(30), microchip: '941000000000001' })).expect(201);
    const a = (await request(app).post('/api/adoptions').set(H(taker)).send({ animalId: res.body._id }).expect(201)).body.id;
    const r = await request(app).post(`/api/rehome/adoptions/${a}/choose`).set(H(giver)).expect(409);
    expect(r.body.error).toBe('too_young');
  });

  it('rechazar y retirar el anuncio cierran las solicitudes; al desactivar, se oculta', async () => {
    const animalId = await published();
    const a1 = (await request(app).post('/api/adoptions').set(H(taker)).send({ animalId }).expect(201)).body.id;
    await request(app).post(`/api/rehome/adoptions/${a1}/reject`).set(H(giver)).expect(200);
    const a2 = (await request(app).post('/api/adoptions').set(H(other)).send({ animalId }).expect(201)).body.id;
    await request(app).post(`/api/rehome/animals/${animalId}/withdraw`).set(H(giver)).expect(200);
    const mine = await request(app).get('/api/rehome/animals').set(H(giver)).expect(200);
    expect(mine.body.items[0].requests.find((r: any) => r.adoptionId === a2).status).toBe('rechazada');

    const second = (await request(app).post('/api/rehome/animals').set(H(giver)).send(listing({ microchip: '941000000000002' })).expect(201)).body._id;
    await request(app).patch(`/api/rehome/admin/users/${giver}`).set(H(admin, 'admin')).send({ enabled: false }).expect(200);
    expect((await Animal.findById(second).lean()).status).toBe('no_disponible');
  });
});
