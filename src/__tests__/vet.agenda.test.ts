import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendSms: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/push', () => ({ sendPushToUser: jest.fn().mockResolvedValue(undefined) }));

// Agenda del veterinario y huecos libres de la reserva («Citas», maqueta del 2 nov 2026).

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let madridToDate: (ymd: string, hhmm: string) => Date;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  madridToDate = (await import('../utils/vetAgenda')).madridToDate;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const vetId = new mongoose.Types.ObjectId().toHexString();
const userId = new mongoose.Types.ObjectId().toHexString();
const otroId = new mongoose.Types.ObjectId().toHexString();
const vetH = { 'x-user-id': vetId, 'x-user-role': 'vet', 'x-user-verified': 'true' };
const userH = { 'x-user-id': userId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const otroH = { 'x-user-id': otroId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

/** El lunes de dentro de 1-2 semanas (AAAA-MM-DD): siempre en el futuro y dentro de la ventana. */
function proximoLunes() {
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const sumarDias = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) await mongoose.connection.db.dropDatabase();
  await User.create([
    { _id: vetId, name: 'CentroVet', email: 'vet@test.com', passwordHash: 'x', role: 'vet' },
    { _id: userId, name: 'Lucía', email: 'lucia@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: otroId, name: 'Pablo', email: 'pablo@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
});

const huecos = (desde: string, dias = 7) =>
  request(app).get(`/api/vets/${vetId}/availability`).query({ desde, dias }).expect(200);

describe('Huecos libres del veterinario', () => {
  it('sin agenda propia: de lunes a viernes, mañana y tarde; fin de semana sin huecos', async () => {
    const lunes = proximoLunes();
    const res = await huecos(lunes);
    expect(res.body.agendaPropia).toBe(false);
    const porFecha = Object.fromEntries(res.body.dias.map((d: any) => [d.fecha, d.horas]));
    expect(porFecha[lunes]).toEqual(['10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00']);
    expect(porFecha[sumarDias(lunes, 5)]).toEqual([]); // sábado
    expect(porFecha[sumarDias(lunes, 6)]).toEqual([]); // domingo
  });

  it('el veterinario guarda su agenda desde el perfil y la reserva la respeta', async () => {
    await request(app)
      .patch(`/api/users/${vetId}`)
      .set(vetH)
      .send({ profile: { vet: { agenda: { dias: [6, 6, 9], horas: ['09:30', '25:00', '12:00'] } } } })
      .expect(200);
    const lunes = proximoLunes();
    const res = await huecos(lunes);
    expect(res.body.agendaPropia).toBe(true);
    expect(res.body.agenda).toEqual({ dias: [6], horas: ['09:30', '12:00'] });
    const porFecha = Object.fromEntries(res.body.dias.map((d: any) => [d.fecha, d.horas]));
    expect(porFecha[lunes]).toEqual([]);
    expect(porFecha[sumarDias(lunes, 5)]).toEqual(['09:30', '12:00']);
  });

  it('los días ya pasados no tienen huecos', async () => {
    const res = await huecos('2020-01-06', 3);
    // Se recorta al día de hoy: nada anterior sale.
    expect(res.body.dias[0].fecha >= new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)).toBe(true);
  });

  it('una hora pedida deja de salir, y nadie más puede pedirla', async () => {
    const lunes = proximoLunes();
    const when = madridToDate(lunes, '12:00').toISOString();
    await request(app).post('/api/vet-appointments').set(userH).send({ vetId, reason: 'Revisión general', requestedAt: when }).expect(201);

    const res = await huecos(lunes, 1);
    expect(res.body.dias[0].horas).not.toContain('12:00');
    expect(res.body.dias[0].horas).toContain('11:00');

    const otra = await request(app).post('/api/vet-appointments').set(otroH).send({ vetId, reason: 'Vacunas', requestedAt: when }).expect(409);
    expect(otra.body.error).toBe('slot_taken');
  });

  it('una cita cancelada libera la hora', async () => {
    const lunes = proximoLunes();
    const when = madridToDate(lunes, '16:00').toISOString();
    const cita = await request(app).post('/api/vet-appointments').set(userH).send({ vetId, reason: 'Revisión general', requestedAt: when }).expect(201);
    await request(app).patch(`/api/vet-appointments/${cita.body._id}/status`).set(userH).send({ status: 'cancelled' }).expect(200);
    const res = await huecos(lunes, 1);
    expect(res.body.dias[0].horas).toContain('16:00');
  });

  it('la hora es la de España aunque el servidor vaya en UTC (con cambio de hora)', () => {
    expect(madridToDate('2026-01-15', '10:00').toISOString()).toBe('2026-01-15T09:00:00.000Z'); // invierno, UTC+1
    expect(madridToDate('2026-07-15', '10:00').toISOString()).toBe('2026-07-15T08:00:00.000Z'); // verano, UTC+2
  });

  it('un veterinario que no existe da 404', async () => {
    await request(app).get(`/api/vets/${new mongoose.Types.ObjectId()}/availability`).expect(404);
    await request(app).get('/api/vets/no-es-un-id/availability').expect(404);
  });
});
