import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

// Cuidado diario (`POST /api/animals/:id/care/feed|litter`). Estos endpoints no
// tenían ningún test y `authorizeCare` devolvía 403 a todo el mundo salvo admin:
// buscaba la adopción por `status: 'accepted'` (estado inexistente, legado del
// alquiler), no miraba `ownerId` (mascotas personales) y solo aceptaba el rol
// `landlord` cuando la ruta también admite `protectora`.

let app: any;
let mongo: MongoMemoryServer | undefined;
let Animal: any;
let Adoption: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
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

const shelterH = { 'x-user-id': shelterId, 'x-user-role': 'protectora', 'x-user-verified': 'true' };
const adopterH = { 'x-user-id': adopterId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const strangerH = { 'x-user-id': strangerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  // El registro congela el nombre de quien marca el cuidado, así que hacen falta
  // usuarios de verdad y no solo sus ids en las cabeceras.
  const { User } = await import('../models/user.model');
  await User.create([
    { _id: shelterId, name: 'Protectora Sur', email: 'shelter@care.test', passwordHash: 'x', role: 'landlord' },
    { _id: adopterId, name: 'Ana', email: 'ana@care.test', passwordHash: 'x', role: 'tenant' },
    { _id: strangerId, name: 'Otro', email: 'otro@care.test', passwordHash: 'x', role: 'tenant' },
  ]);
});

async function createShelterAnimal(extra: Record<string, unknown> = {}) {
  return Animal.create({
    shelter: shelterId,
    name: 'Luna',
    species: 'gato',
    age: '2 años',
    status: 'publicado',
    createdByRole: 'protectora',
    ...extra,
  });
}

async function createPersonalPet() {
  return Animal.create({
    shelter: adopterId,
    ownerId: adopterId,
    name: 'Michi',
    species: 'gato',
    age: '4 años',
    isPersonalPet: true,
    createdByRole: 'tenant',
  });
}

describe('cuidado diario: quién puede registrarlo', () => {
  it('el adoptante puede marcar comida del animal que adoptó (adopción aprobada)', async () => {
    const animal = await createShelterAnimal();
    await Adoption.create({ animalId: String(animal._id), adopterId, status: 'aprobada' });

    const res = await request(app).post(`/api/animals/${animal._id}/care/feed`).set(adopterH).send({});

    expect(res.status).toBe(200);
    expect(res.body.lastFeeding).toBeTruthy();
  });

  it('el dueño de una mascota personal puede marcar comida y arena', async () => {
    const pet = await createPersonalPet();

    const feed = await request(app).post(`/api/animals/${pet._id}/care/feed`).set(adopterH).send({});
    const litter = await request(app).post(`/api/animals/${pet._id}/care/litter`).set(adopterH).send({});

    expect(feed.status).toBe(200);
    expect(litter.status).toBe(200);
    expect(litter.body.lastLitterChange).toBeTruthy();
  });

  it('la protectora dueña del animal puede registrar el cuidado', async () => {
    const animal = await createShelterAnimal();

    const res = await request(app).post(`/api/animals/${animal._id}/care/feed`).set(shelterH).send({});

    expect(res.status).toBe(200);
  });

  it('una solicitud que aún no está aprobada no da permiso', async () => {
    const animal = await createShelterAnimal();
    await Adoption.create({ animalId: String(animal._id), adopterId, status: 'en_revision' });

    const res = await request(app).post(`/api/animals/${animal._id}/care/feed`).set(adopterH).send({});

    expect(res.status).toBe(403);
  });

  it('un tercero sin relación con el animal recibe 403', async () => {
    const animal = await createShelterAnimal();

    const res = await request(app).post(`/api/animals/${animal._id}/care/feed`).set(strangerH).send({});

    expect(res.status).toBe(403);
  });
});

// El registro (`CareLog`) nació porque marcar comida solo escribía una fecha
// encima de la anterior: dos comidas en un día eran una, no se sabía quién la
// había puesto y no había dónde guardar un detalle.
describe('cuidado diario: qué se guarda', () => {
  it('cada marca deja una entrada en el registro, no pisa la anterior', async () => {
    const pet = await createPersonalPet();

    await request(app).post(`/api/animals/${pet._id}/care/feed`).set(adopterH).send({}).expect(200);
    await request(app).post(`/api/animals/${pet._id}/care/feed`).set(adopterH).send({}).expect(200);

    const res = await request(app).get(`/api/animals/${pet._id}/care`).set(adopterH).expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.summary.feedings).toBe(2);
  });

  it('guarda hasta dos comidas y recuerda quién lo marcó', async () => {
    const pet = await createPersonalPet();

    const res = await request(app)
      .post(`/api/animals/${pet._id}/care/feed`)
      .set(adopterH)
      .send({ foods: ['Acana Adult', 'Latita Almo', 'Una tercera que sobra'] })
      .expect(200);

    expect(res.body.entry.foods).toEqual(['Acana Adult', 'Latita Almo']);
    expect(res.body.entry.actorName).toBe('Ana');
  });

  it('la despensa aprende lo que se usa, sin duplicados y con lo último primero', async () => {
    const pet = await createPersonalPet();
    const feed = (foods: string[]) =>
      request(app).post(`/api/animals/${pet._id}/care/feed`).set(adopterH).send({ foods }).expect(200);

    await feed(['Acana Adult']);
    await feed(['Latita Almo']);
    await feed(['acana adult']); // la misma con otra caja: no debe duplicarse

    const res = await request(app).get(`/api/animals/${pet._id}/care`).set(adopterH).expect(200);
    expect(res.body.pantry.foods).toEqual(['acana adult', 'Latita Almo']);
  });

  it('el tipo de arena también se recuerda', async () => {
    const pet = await createPersonalPet();

    await request(app)
      .post(`/api/animals/${pet._id}/care/litter`)
      .set(adopterH)
      .send({ litterType: 'Sílice' })
      .expect(200);

    const res = await request(app).get(`/api/animals/${pet._id}/care`).set(adopterH).expect(200);
    expect(res.body.pantry.litters).toEqual(['Sílice']);
    expect(res.body.items[0].litterType).toBe('Sílice');
  });
});

describe('paseos', () => {
  async function createDog() {
    return Animal.create({
      shelter: adopterId,
      ownerId: adopterId,
      name: 'Nala',
      species: 'perro',
      age: '3 años',
      isPersonalPet: true,
      createdByRole: 'tenant',
    });
  }

  it('registra tipo, minutos, distancia y lugar', async () => {
    const dog = await createDog();

    const res = await request(app)
      .post(`/api/animals/${dog._id}/care/walk`)
      .set(adopterH)
      .send({ kind: 'senderismo', minutes: 95, distanceKm: 8.2, place: 'Monte Xalo' })
      .expect(200);

    expect(res.body.entry.walk).toMatchObject({ kind: 'senderismo', minutes: 95, distanceKm: 8.2, place: 'Monte Xalo' });
    expect(res.body.lastWalk).toBeTruthy();
  });

  it('el tipo es obligatorio; el resto no', async () => {
    const dog = await createDog();

    const sinTipo = await request(app).post(`/api/animals/${dog._id}/care/walk`).set(adopterH).send({ minutes: 20 });
    expect(sinTipo.status).toBe(400);
    expect(sinTipo.body.error).toBe('walk_kind_required');

    // Un paseo registrado a medias vale más que un paseo sin registrar.
    await request(app).post(`/api/animals/${dog._id}/care/walk`).set(adopterH).send({ kind: 'suave' }).expect(200);
  });

  it('rechaza duraciones y distancias imposibles', async () => {
    const dog = await createDog();
    const walk = (body: any) => request(app).post(`/api/animals/${dog._id}/care/walk`).set(adopterH).send(body);

    expect((await walk({ kind: 'largo', minutes: 5000 })).body.error).toBe('invalid_minutes');
    expect((await walk({ kind: 'largo', distanceKm: 500 })).body.error).toBe('invalid_distance');
  });

  it('suma la semana: paseos, kilómetros y minutos', async () => {
    const dog = await createDog();
    const walk = (body: any) =>
      request(app).post(`/api/animals/${dog._id}/care/walk`).set(adopterH).send(body).expect(200);

    await walk({ kind: 'suave', minutes: 20, distanceKm: 1.2 });
    await walk({ kind: 'corriendo', minutes: 35, distanceKm: 6.1 });
    await walk({ kind: 'senderismo', minutes: 40 }); // sin distancia: no debe romper la suma

    const res = await request(app).get(`/api/animals/${dog._id}/care`).set(adopterH).expect(200);
    expect(res.body.summary.walks).toBe(3);
    expect(res.body.summary.walkKm).toBe(7.3);
    expect(res.body.summary.walkMinutes).toBe(95);
  });

  it('un gato no pasea y un perro no usa arenero', async () => {
    const dog = await createDog();
    const cat = await createPersonalPet();

    const paseoDeGato = await request(app).post(`/api/animals/${cat._id}/care/walk`).set(adopterH).send({ kind: 'suave' });
    expect(paseoDeGato.status).toBe(400);
    expect(paseoDeGato.body.error).toBe('walk_not_applicable');

    const arenaDePerro = await request(app).post(`/api/animals/${dog._id}/care/litter`).set(adopterH).send({});
    expect(arenaDePerro.status).toBe(400);
    expect(arenaDePerro.body.error).toBe('litter_not_applicable');
  });

  it('otras especies pueden usar arenero (un conejo lo usa)', async () => {
    const rabbit = await Animal.create({
      shelter: adopterId, ownerId: adopterId, name: 'Trufa', species: 'conejo',
      age: '1 año', isPersonalPet: true, createdByRole: 'tenant',
    });

    await request(app).post(`/api/animals/${rabbit._id}/care/litter`).set(adopterH).send({}).expect(200);
  });
});
