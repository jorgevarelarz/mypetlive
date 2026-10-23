import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

// Mascota fallecida: mural «en su memoria», mensajes con permiso y fin de los avisos.

jest.mock('../utils/push', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendSms: jest.fn().mockResolvedValue(undefined),
}));
import { sendPushToUser } from '../utils/push';
import { sendEmail } from '../utils/notification';

let app: any;
let mongo: MongoMemoryServer | undefined;
let Animal: any;
let User: any;
let CareLog: any;
let sendCareReminders: (now?: Date) => Promise<number>;
let sendHealthDueReminders: (now?: Date) => Promise<number>;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  Animal = (await import('../models/animal.model')).Animal;
  User = (await import('../models/user.model')).User;
  CareLog = (await import('../models/careLog.model')).CareLog;
  sendCareReminders = (await import('../jobs/careReminders')).sendCareReminders;
  sendHealthDueReminders = (await import('../jobs/reminders')).sendHealthDueReminders;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const ownerId = new mongoose.Types.ObjectId().toHexString();
const ownerH = { 'x-user-id': ownerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const strangerH = { ...ownerH, 'x-user-id': new mongoose.Types.ObjectId().toHexString() };
const PHOTO = 'https://mypetlive.es/uploads/1b2c3d4e-0000-4000-8000-000000000001.webp';

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  (sendPushToUser as jest.Mock).mockClear();
  (sendEmail as jest.Mock).mockClear();
  await User.create({ _id: ownerId, name: 'Ana López', email: 'ana@memorial.test', passwordHash: 'x', role: 'tenant' });
});

async function luna(extra: Record<string, unknown> = {}) {
  return Animal.create({
    shelter: ownerId,
    ownerId,
    name: 'Luna',
    species: 'perro',
    age: '12 años',
    birthDate: new Date('2014-03-28'),
    isPersonalPet: true,
    createdByRole: 'tenant',
    status: 'publicado',
    code: 'LU4821',
    images: [PHOTO],
    ...extra,
  });
}

it('despedirla convierte el pasaporte en su mural, con su comida favorita y sus números', async () => {
  const pet = await luna();
  await CareLog.create([
    { animalId: pet._id, type: 'feed', foods: ['Acana Adult'] },
    { animalId: pet._id, type: 'feed', foods: ['acana adult', 'Lata'] },
    { animalId: pet._id, type: 'walk', walk: { kind: 'largo', distanceKm: 3.2 } },
  ]);

  await request(app).post(`/api/animals/${pet._id}/memorial`).set(ownerH).send({ diedAt: '2026-10-03' }).expect(200);

  const passport = await request(app).get('/api/animals/passport/LU4821').expect(200);
  const m = passport.body.memorial;
  expect(m.active).toBe(true);
  expect(m.favorites.food).toBe('Acana Adult');
  expect(m.media).toEqual([{ url: PHOTO, kind: 'image' }]);
  expect(m.stats.map((s: any) => s.key)).toEqual(expect.arrayContaining(['years', 'walks', 'feedings']));
  expect(m.stats.find((s: any) => s.key === 'years').value).toBe(12);
  expect(m.by).toBe('Ana');
});

it('se paran los avisos de cuidado y de vacunas', async () => {
  const pet = await luna({
    careReminders: { feed: { times: ['20:00'] } },
    healthHistory: [{ type: 'vaccine', nextDueAt: new Date(Date.now() + 2 * 24 * 3_600_000) }],
  });
  await request(app).post(`/api/animals/${pet._id}/memorial`).set(ownerH).send({}).expect(200);

  expect(await sendCareReminders(new Date('2026-10-23T18:05:00Z'))).toBe(0);
  expect(await sendHealthDueReminders()).toBe(0);
  expect(sendEmail).not.toHaveBeenCalled();
});

it('cierra el modo perdido y deja de publicar el teléfono', async () => {
  const pet = await luna({ lost: { isLost: true, since: new Date(), contact: '600123456', sightings: [] } });
  await request(app).post(`/api/animals/${pet._id}/memorial`).set(ownerH).send({}).expect(200);
  const passport = await request(app).get('/api/animals/passport/LU4821').expect(200);
  expect(passport.body.lost.isLost).toBe(false);
  expect(JSON.stringify(passport.body)).not.toContain('600123456');
});

it('los mensajes de las visitas solo salen si la familia los publica', async () => {
  const pet = await luna();
  await request(app).post(`/api/animals/${pet._id}/memorial`).set(ownerH).send({}).expect(200);

  await request(app)
    .post('/api/animals/passport/LU4821/memorial-message')
    .send({ name: 'Marta', text: 'Gracias por tantos paseos.' })
    .expect(201);
  // La familia se entera, sin el texto del mensaje en la notificación.
  const [to, push] = (sendPushToUser as jest.Mock).mock.calls.at(-1);
  expect(to).toBe(ownerId);
  expect(push.body).not.toContain('paseos');

  let passport = await request(app).get('/api/animals/passport/LU4821').expect(200);
  expect(passport.body.memorial.messages).toHaveLength(0);

  const family = await request(app).get(`/api/animals/${pet._id}/memorial`).set(ownerH).expect(200);
  expect(family.body.messages).toHaveLength(1);
  const msgId = family.body.messages[0]._id;

  await request(app).patch(`/api/animals/${pet._id}/memorial/messages/${msgId}`).set(strangerH).send({ status: 'published' }).expect(403);
  await request(app).patch(`/api/animals/${pet._id}/memorial/messages/${msgId}`).set(ownerH).send({ status: 'published' }).expect(200);

  passport = await request(app).get('/api/animals/passport/LU4821').expect(200);
  expect(passport.body.memorial.messages[0].text).toBe('Gracias por tantos paseos.');
});

it('velas y mensajes solo en mascotas despedidas', async () => {
  const pet = await luna();
  await request(app).post('/api/animals/passport/LU4821/candle').expect(404);
  await request(app).post('/api/animals/passport/LU4821/memorial-message').send({ name: 'X', text: 'Y' }).expect(404);

  await request(app).post(`/api/animals/${pet._id}/memorial`).set(ownerH).send({}).expect(200);
  const lit = await request(app).post('/api/animals/passport/LU4821/candle').expect(200);
  expect(lit.body.candles).toBe(1);
});

it('la familia llena el mural; nadie más puede, y solo con ficheros nuestros', async () => {
  const pet = await luna();
  await request(app).post(`/api/animals/${pet._id}/memorial`).set(strangerH).send({}).expect(403);
  await request(app).post(`/api/animals/${pet._id}/memorial`).set(ownerH).send({}).expect(200);

  await request(app)
    .put(`/api/animals/${pet._id}/memorial`)
    .set(ownerH)
    .send({ epitaph: 'Doce años a los pies de la cama.', favorites: { toy: 'Una pelota sin pelo' } })
    .expect(200);
  await request(app)
    .post(`/api/animals/${pet._id}/memorial/memories`)
    .set(ownerH)
    .send({ month: '2014-03', text: 'Cabía en una zapatilla.' })
    .expect(201);
  await request(app).post(`/api/animals/${pet._id}/memorial/memories`).set(ownerH).send({ month: '2014-13', text: 'x' }).expect(400);
  await request(app)
    .post(`/api/animals/${pet._id}/memorial/media`)
    .set(ownerH)
    .send({ url: 'https://evil.example/pixel.gif?track=1' })
    .expect(400);
  const video = await request(app)
    .post(`/api/animals/${pet._id}/memorial/media`)
    .set(ownerH)
    .send({ url: 'https://mypetlive.es/uploads/1b2c3d4e-0000-4000-8000-000000000002.mov' })
    .expect(200);
  expect(video.body.memorial.media[0].kind).toBe('video');

  const passport = await request(app).get('/api/animals/passport/LU4821').expect(200);
  expect(passport.body.memorial.epitaph).toBe('Doce años a los pies de la cama.');
  expect(passport.body.memorial.favorites.toy).toBe('Una pelota sin pelo');
  expect(passport.body.memorial.memories[0].text).toBe('Cabía en una zapatilla.');
});

it('deshacerlo («ha sido un error») devuelve el pasaporte normal sin perder lo escrito', async () => {
  const pet = await luna();
  await request(app).post(`/api/animals/${pet._id}/memorial`).set(ownerH).send({}).expect(200);
  await request(app).put(`/api/animals/${pet._id}/memorial`).set(ownerH).send({ epitaph: 'Hola' }).expect(200);
  await request(app).delete(`/api/animals/${pet._id}/memorial`).set(ownerH).expect(200);

  const passport = await request(app).get('/api/animals/passport/LU4821').expect(200);
  expect(passport.body.memorial).toBeNull();
  const stored = await Animal.findById(pet._id).lean();
  expect(stored.memorial.epitaph).toBe('Hola');
});
