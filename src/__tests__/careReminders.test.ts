import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

// Recordatorios de comida, arena y paseos (notificación al móvil).

jest.mock('../utils/push', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));
import { sendPushToUser } from '../utils/push';

let app: any;
let mongo: MongoMemoryServer | undefined;
let Animal: any;
let User: any;
let sendCareReminders: (now?: Date) => Promise<number>;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  Animal = (await import('../models/animal.model')).Animal;
  User = (await import('../models/user.model')).User;
  sendCareReminders = (await import('../jobs/careReminders')).sendCareReminders;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const ownerId = new mongoose.Types.ObjectId().toHexString();
const shelterId = new mongoose.Types.ObjectId().toHexString();
const ownerH = { 'x-user-id': ownerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

// 23 oct 2026 a las 20:05 en Madrid (horario de verano, UTC+2).
const AT_2005 = new Date('2026-10-23T18:05:00Z');
const hoursBefore = (d: Date, h: number) => new Date(d.getTime() - h * 3_600_000);
const pushes = () => (sendPushToUser as jest.Mock).mock.calls;

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  (sendPushToUser as jest.Mock).mockClear();
  await User.create([
    { _id: ownerId, name: 'Ana', email: 'ana@care.test', passwordHash: 'x', role: 'tenant' },
    { _id: shelterId, name: 'Protectora', email: 'pro@care.test', passwordHash: 'x', role: 'landlord' },
  ]);
});

function pet(extra: Record<string, unknown> = {}) {
  return Animal.create({
    shelter: ownerId,
    ownerId,
    name: 'Luna',
    species: 'perro',
    age: '3 años',
    isPersonalPet: true,
    createdByRole: 'tenant',
    ...extra,
  });
}

describe('con horario', () => {
  it('avisa a su hora, con el nombre, y una sola vez por hueco', async () => {
    const luna = await pet({ careReminders: { feed: { times: ['20:00'] } }, lastFeeding: hoursBefore(AT_2005, 12) });

    expect(await sendCareReminders(AT_2005)).toBe(1);
    const [to, msg] = pushes()[0];
    expect(to).toBe(ownerId);
    expect(`${msg.title} ${msg.body}`).toContain('Luna');
    expect(msg.url).toBe(`/pet?mascota=${luna._id}`);

    // La siguiente pasada (5 min después) no repite.
    expect(await sendCareReminders(new Date(AT_2005.getTime() + 5 * 60_000))).toBe(0);
  });

  it('no avisa si ya lo ha marcado poco antes de la hora', async () => {
    await pet({ careReminders: { feed: { times: ['20:00'] } }, lastFeeding: hoursBefore(AT_2005, 1) });
    expect(await sendCareReminders(AT_2005)).toBe(0);
  });

  it('no avisa fuera de su hora', async () => {
    await pet({ careReminders: { feed: { times: ['08:00'] } }, lastFeeding: hoursBefore(AT_2005, 12) });
    expect(await sendCareReminders(AT_2005)).toBe(0);
  });

  it('junta en un aviso a las mascotas de la misma familia a las que les toca a la vez', async () => {
    await pet({ name: 'Luna', careReminders: { feed: { times: ['20:00'] } } });
    await pet({ name: 'Toby', species: 'gato', careReminders: { feed: { times: ['20:00'] } } });

    expect(await sendCareReminders(AT_2005)).toBe(1);
    const [, msg] = pushes()[0];
    expect(`${msg.title} ${msg.body}`).toMatch(/Luna y Toby|Toby y Luna/);
  });

  it('el arenero «cada 2 días» no avisa si se cambió ayer', async () => {
    await pet({
      species: 'gato',
      careReminders: { litter: { everyDays: 2, time: '20:00' } },
      lastLitterChange: hoursBefore(AT_2005, 24),
    });
    expect(await sendCareReminders(AT_2005)).toBe(0);
  });

  it('respeta la especie: un gato no recibe avisos de paseo', async () => {
    await pet({ species: 'gato', careReminders: { walk: { times: ['20:00'] } } });
    expect(await sendCareReminders(AT_2005)).toBe(0);
  });

  it('respeta el apagado', async () => {
    await pet({ careReminders: { feed: { off: true, times: ['20:00'] } } });
    expect(await sendCareReminders(AT_2005)).toBe(0);
  });
});

describe('por olvido', () => {
  it('pregunta una vez si lleva demasiado sin marcar, y no se repite hasta la siguiente marca', async () => {
    const luna = await pet({ lastFeeding: hoursBefore(AT_2005, 15) });
    expect(await sendCareReminders(AT_2005)).toBe(1);
    expect(pushes()[0][1].body).toContain('15 h');
    expect(await sendCareReminders(new Date(AT_2005.getTime() + 3_600_000))).toBe(0);

    // Marca nueva y otro despiste → vuelve a avisar.
    await Animal.updateOne({ _id: luna._id }, { lastFeeding: hoursBefore(AT_2005, -1) });
    expect(await sendCareReminders(new Date(AT_2005.getTime() + 16 * 3_600_000))).toBe(1);
  });

  it('no molesta a quien nunca marca nada ni de madrugada', async () => {
    await pet();
    expect(await sendCareReminders(AT_2005)).toBe(0);

    // 20 h sin comer apuntada, pero son las 3:00 en Madrid: espera a la mañana.
    const AT_0300 = new Date('2026-10-23T01:00:00Z');
    await pet({ name: 'Nala', lastFeeding: hoursBefore(AT_0300, 20) });
    expect(await sendCareReminders(AT_0300)).toBe(0);
    expect(await sendCareReminders(new Date('2026-10-23T07:30:00Z'))).toBe(1); // 9:30
  });

  it('no avisa a protectoras aunque el animal vuelva a su cargo', async () => {
    await pet({ ownerId: shelterId, shelter: shelterId, lastFeeding: hoursBefore(AT_2005, 20) });
    expect(await sendCareReminders(AT_2005)).toBe(0);
  });
});

describe('configuración', () => {
  it('guarda horarios válidos y los devuelve en el cuidado, sin el estado interno', async () => {
    const luna = await pet();
    const res = await request(app)
      .put(`/api/animals/${luna._id}/care/reminders`)
      .set(ownerH)
      .send({ feed: { times: ['20:00', '08:00', '08:00'] }, walk: { off: true }, litter: {} })
      .expect(200);
    expect(res.body.reminders.feed.times).toEqual(['08:00', '20:00']);
    expect(res.body.reminders.walk.off).toBe(true);

    const care = await request(app).get(`/api/animals/${luna._id}/care`).set(ownerH).expect(200);
    expect(care.body.reminders.feed.times).toEqual(['08:00', '20:00']);
    expect(care.body.reminders.sent).toBeUndefined();
  });

  it('rechaza horas imposibles y no deja tocar la mascota de otro', async () => {
    const luna = await pet();
    await request(app).put(`/api/animals/${luna._id}/care/reminders`).set(ownerH).send({ feed: { times: ['25:00'] } }).expect(400);
    const otherH = { ...ownerH, 'x-user-id': new mongoose.Types.ObjectId().toHexString() };
    await request(app).put(`/api/animals/${luna._id}/care/reminders`).set(otherH).send({}).expect(403);
  });
});
