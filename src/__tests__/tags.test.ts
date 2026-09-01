import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

let app: any;
let mongo: MongoMemoryServer | undefined;
let Animal: any;
let Tag: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  process.env.FRONTEND_URL = 'https://mypetlive.es';
  const mod = await import('../app');
  app = mod.app || mod.default;
  Animal = (await import('../models/animal.model')).Animal;
  Tag = (await import('../models/tag.model')).Tag;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const ownerId = new mongoose.Types.ObjectId().toHexString();
const strangerId = new mongoose.Types.ObjectId().toHexString();
const adminId = new mongoose.Types.ObjectId().toHexString();

const ownerH = { 'x-user-id': ownerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const strangerH = { 'x-user-id': strangerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const adminH = { 'x-user-id': adminId, 'x-user-role': 'admin', 'x-user-verified': 'true' };

async function makeAnimal(owner = ownerId, name = 'Luna') {
  return Animal.create({
    name,
    species: 'dog',
    age: 3,
    city: 'A Coruña',
    status: 'no_disponible',
    isPersonalPet: true,
    createdByRole: 'tenant',
    ownerId: owner,
    shelter: owner,
  });
}

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
});

describe('fabricación de lotes', () => {
  it('genera códigos únicos con el prefijo pedido', async () => {
    const res = await request(app)
      .post('/api/admin/tags/batch')
      .set(adminH)
      .send({ count: 100, batch: '2026-08-A', prefix: 'MPL' });

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(100);
    expect(new Set(res.body.codes).size).toBe(100);
    for (const code of res.body.codes) {
      expect(code).toMatch(/^MPL-[0-9A-HJKMNP-TV-Z]{6}$/);
    }
  });

  it('exporta el CSV que se manda al proveedor', async () => {
    await request(app).post('/api/admin/tags/batch').set(adminH).send({ count: 3, batch: 'L1', prefix: 'PET' });
    const res = await request(app).get('/api/admin/tags/batch/L1.csv').set(adminH);

    expect(res.status).toBe(200);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe('codigo,url');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^PET-[0-9A-Z]{6},https:\/\/mypetlive\.es\/t\/PET-[0-9A-Z]{6}$/);
  });

  it('no deja duplicar un lote ya fabricado', async () => {
    await request(app).post('/api/admin/tags/batch').set(adminH).send({ count: 2, batch: 'L1' });
    const res = await request(app).post('/api/admin/tags/batch').set(adminH).send({ count: 2, batch: 'L1' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('batch_exists');
  });

  it('solo el admin fabrica chapas', async () => {
    const res = await request(app).post('/api/admin/tags/batch').set(ownerH).send({ count: 1, batch: 'X' });
    expect(res.status).toBe(403);
  });
});

describe('escanear una chapa', () => {
  it('la chapa recién fabricada sale vacía', async () => {
    const tag = await Tag.create({ code: 'MPL-AAAAAA', batch: 'L1' });
    const res = await request(app).get(`/api/tags/${tag.code}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('libre');
  });

  it('resuelve sin sesión y devuelve el código del animal', async () => {
    const animal = await makeAnimal();
    const tag = await Tag.create({ code: 'MPL-BBBBBB', batch: 'L1', animalId: animal._id });

    // Token ilegible en vez de cabecera ausente: en NODE_ENV=test `authenticate`
    // inyecta un usuario falso cuando no hay token, así que una petición pelada
    // no distingue una ruta pública de una protegida (ver public.access.test).
    const res = await request(app).get(`/api/tags/${tag.code}`).set('Authorization', 'Bearer no.es.un.jwt');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('vinculada');
    expect(res.body.animal.code).toBe(animal.code);
  });

  it('cuenta los escaneos', async () => {
    const tag = await Tag.create({ code: 'MPL-CCCCCC', batch: 'L1' });
    await request(app).get(`/api/tags/${tag.code}`);
    await request(app).get(`/api/tags/${tag.code}`);

    const fresh = await Tag.findById(tag._id).lean();
    expect(fresh.scans).toBe(2);
    expect(fresh.lastScanAt).toBeTruthy();
  });

  it('una chapa anulada responde 410, no 404', async () => {
    const tag = await Tag.create({ code: 'MPL-DDDDDD', batch: 'L1', revokedAt: new Date() });
    const res = await request(app).get(`/api/tags/${tag.code}`);
    expect(res.status).toBe(410);
  });

  it('si el animal fue borrado la chapa vuelve a estar libre', async () => {
    const animal = await makeAnimal();
    const tag = await Tag.create({ code: 'MPL-EEEEEE', batch: 'L1', animalId: animal._id });
    await Animal.deleteOne({ _id: animal._id });

    const res = await request(app).get(`/api/tags/${tag.code}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('libre');
  });

  it('/mine no lo captura la ruta dinámica', async () => {
    const res = await request(app).get('/api/tags/mine').set(ownerH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

describe('asignar una chapa', () => {
  it('el dueño la casa con su animal por el código', async () => {
    const animal = await makeAnimal();
    const tag = await Tag.create({ code: 'MPL-111111', batch: 'L1' });

    const res = await request(app)
      .post(`/api/tags/${tag.code}/claim`)
      .set(ownerH)
      .send({ animalCode: animal.code });

    expect(res.status).toBe(201);
    expect(res.body.animal.code).toBe(animal.code);

    const fresh = await Tag.findById(tag._id).lean();
    expect(String(fresh.animalId)).toBe(String(animal._id));
    expect(String(fresh.claimedBy)).toBe(ownerId);
  });

  it('acepta el código del animal en minúsculas', async () => {
    const animal = await makeAnimal();
    const tag = await Tag.create({ code: 'MPL-222222', batch: 'L1' });

    const res = await request(app)
      .post(`/api/tags/${tag.code}/claim`)
      .set(ownerH)
      .send({ animalCode: String(animal.code).toLowerCase() });

    expect(res.status).toBe(201);
  });

  it('un extraño NO puede apuntar su chapa al animal de otro', async () => {
    const animal = await makeAnimal();
    const tag = await Tag.create({ code: 'MPL-333333', batch: 'L1' });

    const res = await request(app)
      .post(`/api/tags/${tag.code}/claim`)
      .set(strangerH)
      .send({ animalCode: animal.code });

    expect(res.status).toBe(403);
    const fresh = await Tag.findById(tag._id).lean();
    expect(fresh.animalId).toBeNull();
  });

  it('sin sesión no se puede asignar', async () => {
    const animal = await makeAnimal();
    const tag = await Tag.create({ code: 'MPL-444444', batch: 'L1' });

    const res = await request(app)
      .post(`/api/tags/${tag.code}/claim`)
      .set('Authorization', 'Bearer no.es.un.jwt')
      .send({ animalCode: animal.code });

    expect(res.status).toBe(401);
  });

  it('una chapa ya asignada no se puede robar', async () => {
    const animal = await makeAnimal();
    const otra = await makeAnimal(strangerId, 'Toby');
    const tag = await Tag.create({ code: 'MPL-555555', batch: 'L1', animalId: animal._id });

    const res = await request(app)
      .post(`/api/tags/${tag.code}/claim`)
      .set(strangerH)
      .send({ animalCode: otra.code });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('tag_already_claimed');
  });

  it('un animal no puede llevar dos chapas', async () => {
    const animal = await makeAnimal();
    await Tag.create({ code: 'MPL-666666', batch: 'L1', animalId: animal._id });
    const segunda = await Tag.create({ code: 'MPL-777777', batch: 'L1' });

    const res = await request(app)
      .post(`/api/tags/${segunda.code}/claim`)
      .set(ownerH)
      .send({ animalCode: animal.code });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('animal_already_tagged');
  });

  it('un código de animal que no existe da 404', async () => {
    const tag = await Tag.create({ code: 'MPL-888888', batch: 'L1' });
    const res = await request(app)
      .post(`/api/tags/${tag.code}/claim`)
      .set(ownerH)
      .send({ animalCode: 'NOEXISTE-999' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('animal_not_found');
  });
});

describe('liberar y anular', () => {
  it('el dueño libera la chapa y queda reutilizable', async () => {
    const animal = await makeAnimal();
    const tag = await Tag.create({ code: 'MPL-999999', batch: 'L1', animalId: animal._id, claimedBy: ownerId });

    const res = await request(app).post(`/api/tags/${tag.code}/release`).set(ownerH);
    expect(res.status).toBe(200);

    const otro = await makeAnimal(ownerId, 'Fabi');
    const reclaim = await request(app)
      .post(`/api/tags/${tag.code}/claim`)
      .set(ownerH)
      .send({ animalCode: otro.code });
    expect(reclaim.status).toBe(201);
  });

  it('un extraño no puede liberar la chapa de otro', async () => {
    const animal = await makeAnimal();
    const tag = await Tag.create({ code: 'MPL-AAA111', batch: 'L1', animalId: animal._id, claimedBy: ownerId });

    const res = await request(app).post(`/api/tags/${tag.code}/release`).set(strangerH);
    expect(res.status).toBe(403);
  });

  it('el admin anula una chapa perdida', async () => {
    const animal = await makeAnimal();
    const tag = await Tag.create({ code: 'MPL-BBB222', batch: 'L1', animalId: animal._id });

    const res = await request(app).post(`/api/admin/tags/${tag.code}/revoke`).set(adminH);
    expect(res.status).toBe(200);

    const scan = await request(app).get(`/api/tags/${tag.code}`);
    expect(scan.status).toBe(410);
  });
});
