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

const shelterId = new mongoose.Types.ObjectId().toHexString();
const familyId = new mongoose.Types.ObjectId().toHexString();
const strangerId = new mongoose.Types.ObjectId().toHexString();

const familyH = { 'x-user-id': familyId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const strangerH = { 'x-user-id': strangerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: shelterId, name: 'Protectora Lugo', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord' },
    { _id: familyId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: strangerId, name: 'Curioso', email: 'curioso@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
});

async function createPersonalPet() {
  const res = await request(app)
    .post('/api/animals/personal')
    .set(familyH)
    .send({ name: 'Luna', species: 'perro', age: '3 años', images: ['https://cdn.test/luna-1.jpg'] })
    .expect(201);
  return res.body;
}

describe('Editar la ficha de mi mascota', () => {
  it('la familia cambia la foto y los datos de su mascota', async () => {
    const pet = await createPersonalPet();

    const res = await request(app)
      .put(`/api/animals/mine/${pet._id}`)
      .set(familyH)
      .send({ name: 'Luna Bella', age: '4 años', mood: 'relajado', images: ['https://cdn.test/luna-2.jpg'] })
      .expect(200);

    expect(res.body.name).toBe('Luna Bella');
    expect(res.body.age).toBe('4 años');
    expect(res.body.mood).toBe('relajado');
    expect(res.body.images).toEqual(['https://cdn.test/luna-2.jpg']);
  });

  it('permite quitar el estado emocional mandando null', async () => {
    const pet = await createPersonalPet();
    await request(app).put(`/api/animals/mine/${pet._id}`).set(familyH).send({ mood: 'energico' }).expect(200);

    const res = await request(app).put(`/api/animals/mine/${pet._id}`).set(familyH).send({ mood: null }).expect(200);
    expect(res.body.mood).toBeNull();
  });

  // El circuito de adopción es de la protectora: desde aquí no se publica una
  // mascota personal ni se le cambia de dueño, aunque viaje en el cuerpo.
  it('ignora status, shelter y ownerId', async () => {
    const pet = await createPersonalPet();

    await request(app)
      .put(`/api/animals/mine/${pet._id}`)
      .set(familyH)
      .send({ name: 'Luna', status: 'publicado', shelter: shelterId, ownerId: strangerId })
      .expect(200);

    const saved = await Animal.findById(pet._id);
    expect(saved.status).toBe('no_disponible');
    expect(String(saved.ownerId)).toBe(familyId);
    expect(String(saved.shelter)).toBe(familyId);
  });

  it('un tercero no puede editar una mascota ajena', async () => {
    const pet = await createPersonalPet();
    await request(app).put(`/api/animals/mine/${pet._id}`).set(strangerH).send({ name: 'Mía' }).expect(403);
  });

  it('rechaza un nombre vacío y una imagen que no es una URL de foto', async () => {
    const pet = await createPersonalPet();
    await request(app).put(`/api/animals/mine/${pet._id}`).set(familyH).send({ name: '   ' }).expect(400);
    await request(app)
      .put(`/api/animals/mine/${pet._id}`)
      .set(familyH)
      .send({ images: ['javascript:alert(1)'] })
      .expect(400);
  });

  it('no toca por esta vía una ficha en adopción de una protectora', async () => {
    const shelterAnimal = await Animal.create({
      shelter: shelterId,
      name: 'Nube',
      species: 'gato',
      age: '1 año',
      isPersonalPet: false,
      createdByRole: 'protectora',
      status: 'publicado',
    });

    await request(app)
      .put(`/api/animals/mine/${shelterAnimal._id}`)
      .set(familyH)
      .send({ name: 'Nube mía' })
      .expect(404);
  });
});
