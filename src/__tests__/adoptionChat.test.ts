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
let Animal: any;
let Adoption: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
  Adoption = (await import('../models/adoption.model')).Adoption;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const shelterId = new mongoose.Types.ObjectId().toHexString();
const adopterId = new mongoose.Types.ObjectId().toHexString();
const strangerId = new mongoose.Types.ObjectId().toHexString();
const shelterH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const adopterH = { 'x-user-id': adopterId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const strangerH = { 'x-user-id': strangerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

let animalId: string;
let adoptionId: string;

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    {
      _id: shelterId, name: 'Protectora Norte', email: 'norte@test.com', passwordHash: 'x', role: 'landlord',
      profile: { orgName: 'Protectora Norte ONG', bio: 'Rescatamos y damos hogar desde 2010.', address: { city: 'Lugo' } },
    },
    { _id: adopterId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: strangerId, name: 'Otro', email: 'otro@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
  const animal = await Animal.create({
    name: 'Nina', species: 'dog', age: '2 años', shelter: shelterId,
    createdByRole: 'protectora', status: 'publicado', isPersonalPet: false,
  });
  animalId = String(animal._id);
  const adoption = await Adoption.create({ animalId, adopterId, status: 'recibida' });
  adoptionId = String(adoption._id);
});

describe('Chat de adopción (adoptante ↔ protectora)', () => {
  it('crea la conversación para ambas partes y bloquea a terceros', async () => {
    const mine = await request(app)
      .post('/api/chat/conversations/ensure')
      .set(adopterH)
      .send({ kind: 'adoption', refId: adoptionId })
      .expect(200);
    expect(mine.body.participants.sort()).toEqual([adopterId, shelterId].sort());
    expect(mine.body.meta.animalId).toBe(animalId);
    expect(mine.body.meta.shelterId).toBe(shelterId);

    // La protectora entra a la MISMA conversación (única por solicitud).
    const theirs = await request(app)
      .post('/api/chat/conversations/ensure')
      .set(shelterH)
      .send({ kind: 'adoption', refId: adoptionId })
      .expect(200);
    expect(String(theirs.body._id)).toBe(String(mine.body._id));

    // Un usuario ajeno a la solicitud no puede abrirla.
    await request(app)
      .post('/api/chat/conversations/ensure')
      .set(strangerH)
      .send({ kind: 'adoption', refId: adoptionId })
      .expect(403);
  });

  it('intercambia mensajes con no-leídos y marca de lectura', async () => {
    const conv = await request(app)
      .post('/api/chat/conversations/ensure')
      .set(adopterH)
      .send({ kind: 'adoption', refId: adoptionId })
      .expect(200);
    const convId = String(conv.body._id);

    await request(app)
      .post(`/api/chat/${convId}/messages`)
      .set(adopterH)
      .send({ body: '¡Hola! Me encantaría conocer a Nina.' })
      .expect(201);

    // La protectora ve el mensaje y su contador de no-leídos.
    const msgs = await request(app).get(`/api/chat/${convId}/messages`).set(shelterH).expect(200);
    expect(msgs.body).toHaveLength(1);
    expect(msgs.body[0].body).toContain('Nina');

    const list = await request(app).get('/api/chat/conversations').set(shelterH).expect(200);
    const forMe = list.body.find((c: any) => String(c._id) === convId);
    expect(forMe.unreadForMe).toBe(1);

    await request(app).post(`/api/chat/${convId}/read`).set(shelterH).expect(200);
    const after = await request(app).get('/api/chat/conversations').set(shelterH).expect(200);
    expect(after.body.find((c: any) => String(c._id) === convId).unreadForMe).toBe(0);

    // El ajeno tampoco puede leer ni escribir.
    await request(app).get(`/api/chat/${convId}/messages`).set(strangerH).expect(403);
    await request(app).post(`/api/chat/${convId}/messages`).set(strangerH).send({ body: 'hola' }).expect(403);
  });
});

describe('Perfil público de protectora', () => {
  it('devuelve presentación y contadores sin autenticación', async () => {
    await Animal.create([
      { name: 'Rex', species: 'dog', age: '3 años', shelter: shelterId, createdByRole: 'protectora', status: 'publicado', isPersonalPet: false },
      { name: 'Miau', species: 'cat', age: '1 año', shelter: shelterId, createdByRole: 'protectora', status: 'adoptado', isPersonalPet: false },
    ]);

    const res = await request(app).get(`/api/protectoras/${shelterId}/profile`).expect(200);
    expect(res.body.name).toBe('Protectora Norte ONG');
    expect(res.body.bio).toContain('2010');
    expect(res.body.city).toBe('Lugo');
    expect(res.body.stats.published).toBe(2); // Nina + Rex
    expect(res.body.stats.adopted).toBe(1);
  });

  it('404 para usuarios que no son protectora o ids inválidos', async () => {
    await request(app).get(`/api/protectoras/${adopterId}/profile`).expect(404);
    await request(app).get('/api/protectoras/nope/profile').expect(404);
  });
});
