import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { startMongoMemoryReplicaSet, limpiarBase } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/push', () => ({ sendPushToUser: jest.fn().mockResolvedValue(undefined), pushConfigured: false }));

// «Lo he encontrado»: quien encuentra un animal no puede cederlo (no está a su
// nombre). Busca a su familia y, si no aparece, una protectora lo formaliza
// (sin llevárselo): o le busca familia, o se lo da en adopción a quien lo encontró.

let app: any;
let mongo: MongoMemoryReplSet | undefined;
let User: any;
let FoundAnimal: any;
let Animal: any;
let Adoption: any;
let Verification: any;

beforeAll(async () => {
  mongo = await startMongoMemoryReplicaSet();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  FoundAnimal = (await import('../models/foundAnimal.model')).FoundAnimal;
  Animal = (await import('../models/animal.model')).Animal;
  Adoption = (await import('../models/adoption.model')).Adoption;
  Verification = (await import('../models/verification.model')).Verification;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const id = () => new mongoose.Types.ObjectId().toHexString();
const finder = id(), owner = id(), shelter = id(), otherShelter = id(), admin = id();
const H = (uid: string, role = 'tenant') => ({ 'x-user-id': uid, 'x-user-role': role, 'x-user-verified': 'true' });
const found = (extra: any = {}) => ({
  species: 'cat', name: 'Ronroneo', approxAge: '3 meses', foundAt: new Date().toISOString(),
  foundPlace: 'Playa de Santa Cristina', city: 'Oleiros', images: ['/uploads/r.webp'], ...extra,
});

beforeEach(async () => {
  await limpiarBase();
  await User.create([
    { _id: finder, name: 'Carmen Ruiz', email: 'carmen@test.com', passwordHash: 'x', role: 'tenant', rehome: { enabled: true } },
    { _id: owner, name: 'Lucía Paz', email: 'lucia@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: shelter, name: 'Marta', email: 'p@test.com', passwordHash: 'x', role: 'landlord', profile: { orgName: 'Patitas Felices' } },
    { _id: otherShelter, name: 'Otra', email: 'o@test.com', passwordHash: 'x', role: 'landlord' },
    { _id: admin, name: 'Admin', email: 'a@test.com', passwordHash: 'x', role: 'admin' },
  ]);
  await Verification.create({ userId: shelter, status: 'verified', verificationLevel: 'animal_protection_entity' });
});

async function publish() {
  const res = await request(app).post('/api/found').set(H(finder)).send(found()).expect(201);
  return String(res.body._id);
}
async function stepsDoneAndWaited(fid: string) {
  await request(app).patch(`/api/found/${fid}/steps`).set(H(finder)).send({ chip: { result: 'none', vetName: 'Clínica Lúa' } }).expect(200);
  await request(app).patch(`/api/found/${fid}/steps`).set(H(finder)).send({ council: { who: 'Policía Local de Oleiros' } }).expect(200);
  await FoundAnimal.updateOne({ _id: fid }, { publishedAt: new Date(Date.now() - 8 * 86_400_000) });
}

describe('Animal encontrado', () => {
  it('solo publican los particulares activados; la ficha es pública', async () => {
    await request(app).post('/api/found').set(H(owner)).send(found()).expect(403);
    const fid = await publish();
    const list = await request(app).get('/api/found').expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].chip).toBeUndefined(); // los pasos no se ven en público
    const mine = await request(app).get('/api/found/mine').set(H(finder)).expect(200);
    expect(mine.body.items[0].blockers).toEqual(expect.arrayContaining(['chip', 'council', 'wait']));
    expect((await request(app).get(`/api/found/${fid}`).expect(200)).body.finderName).toBe('Carmen Ruiz');
  });

  it('con chip, se cierra: su familia está localizada', async () => {
    const fid = await publish();
    const r = await request(app).patch(`/api/found/${fid}/steps`).set(H(finder)).send({ chip: { result: 'has_chip' } }).expect(200);
    expect(r.body.status).toBe('reunido');
    expect((await request(app).get('/api/found').expect(200)).body.items).toHaveLength(0);
  });

  it('«Es mío» abre una conversación con quien lo encontró', async () => {
    const fid = await publish();
    await request(app).post(`/api/found/${fid}/claim`).set(H(finder)).expect(400);
    const r = await request(app).post(`/api/found/${fid}/claim`).set(H(owner)).expect(200);
    const again = await request(app).post(`/api/found/${fid}/claim`).set(H(owner)).expect(200);
    expect(again.body.conversationId).toBe(r.body.conversationId);
    const [conv] = (await request(app).get('/api/chat/conversations').set(H(finder)).expect(200)).body;
    expect(conv.context).toMatchObject({ type: 'found', foundId: fid, role: 'finder' });
    expect(conv.animal.name).toBe('Ronroneo');
    expect(conv.lastMessage.systemCode).toBe('found.claim');
  });

  it('no se pide acogida sin chip mirado, aviso al ayuntamiento y 7 días', async () => {
    const fid = await publish();
    const r = await request(app).post(`/api/found/${fid}/foster`).set(H(finder)).send({ shelterId: shelter }).expect(409);
    expect(r.body.blockers).toEqual(expect.arrayContaining(['chip', 'council', 'wait']));
    await stepsDoneAndWaited(fid);
    // Solo protectoras verificadas.
    await request(app).post(`/api/found/${fid}/foster`).set(H(finder)).send({ shelterId: otherShelter }).expect(404);
    const shelters = (await request(app).get('/api/found/shelters').set(H(finder)).expect(200)).body.items;
    expect(shelters.map((s: any) => s.name)).toEqual(['Patitas Felices']);
  });

  it('buscarle familia: la protectora acepta, firma la casa de acogida y la ficha queda en borrador', async () => {
    const fid = await publish();
    await stepsDoneAndWaited(fid);
    await request(app).post(`/api/found/${fid}/foster`).set(H(finder)).send({ shelterId: shelter, message: 'Está sano y come bien.' }).expect(200);
    const [conv] = (await request(app).get('/api/chat/conversations').set(H(shelter, 'landlord')).expect(200)).body;
    expect(conv.context).toMatchObject({ type: 'foster', role: 'shelter' });

    await request(app).post(`/api/found/${fid}/foster/accept`).set(H(otherShelter, 'landlord')).expect(404);
    await request(app).post(`/api/found/${fid}/agreement/sign`).set(H(finder)).send({ fullName: 'Carmen Ruiz López' }).expect(409);
    await request(app).post(`/api/found/${fid}/foster/accept`).set(H(shelter, 'landlord')).expect(200);
    const ag = await request(app).get(`/api/found/${fid}/agreement`).set(H(finder)).expect(200);
    expect(ag.body.text).toContain('CASA DE ACOGIDA');
    const signed = await request(app).post(`/api/found/${fid}/agreement/sign`).set(H(finder)).send({ fullName: 'Carmen Ruiz López' }).expect(200);

    const animal = await Animal.findById(signed.body.animalId).lean();
    expect(animal).toMatchObject({ status: 'borrador', createdByRole: 'protectora', name: 'Ronroneo' });
    expect(String(animal.shelter)).toBe(shelter);
    expect(animal.foster.userId).toBe(finder);
    expect((await FoundAnimal.findById(fid).lean()).status).toBe('en_acogida');
    // En su panel, la protectora ve quién lo tiene en casa (nombre, no correo).
    const panel = await request(app).get('/api/animals').query({ shelter, status: 'borrador' }).set(H(shelter, 'landlord')).expect(200);
    expect(panel.body.items[0].foster).toMatchObject({ userId: finder, name: 'Carmen Ruiz' });
  });

  it('quedármelo yo: la adopción a su nombre queda lista para que la protectora la apruebe', async () => {
    const fid = await publish();
    await stepsDoneAndWaited(fid);
    await request(app).post(`/api/found/${fid}/foster`).set(H(finder)).send({ shelterId: shelter, intent: 'keep' }).expect(200);
    await request(app).post(`/api/found/${fid}/foster/accept`).set(H(shelter, 'landlord')).expect(200);
    const ag = await request(app).get(`/api/found/${fid}/agreement`).set(H(finder)).expect(200);
    expect(ag.body.text).toContain('quiere quedárselo');
    const signed = await request(app).post(`/api/found/${fid}/agreement/sign`).set(H(finder)).send({ fullName: 'Carmen Ruiz López' }).expect(200);
    expect((await Animal.findById(signed.body.animalId).lean()).status).toBe('reservado');

    // La protectora la aprueba desde su panel y pasa a «Mi mascota».
    await request(app).patch(`/api/adoptions/${signed.body.adoptionId}/status`).set(H(shelter, 'landlord')).send({ status: 'aprobada' }).expect(200);
    const animal = await Animal.findById(signed.body.animalId).lean();
    expect(String(animal.ownerId)).toBe(finder);
    expect(animal.status).toBe('adoptado');
  });

  it('si la protectora no puede, vuelve a poder pedírselo a otra', async () => {
    const fid = await publish();
    await stepsDoneAndWaited(fid);
    await request(app).post(`/api/found/${fid}/foster`).set(H(finder)).send({ shelterId: shelter }).expect(200);
    await request(app).post(`/api/found/${fid}/foster`).set(H(finder)).send({ shelterId: shelter }).expect(409);
    await request(app).post(`/api/found/${fid}/foster/reject`).set(H(shelter, 'landlord')).expect(200);
    expect((await FoundAnimal.findById(fid).lean()).status).toBe('buscando');
  });
});
