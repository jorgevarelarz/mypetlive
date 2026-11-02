import fs from 'fs';
import path from 'path';
import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { hueco } from './utils/huecos';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendSms: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/push', () => ({ sendPushToUser: jest.fn().mockResolvedValue(undefined) }));

// Arreglos de la auditoría AUD-3 de la fábrica (2 nov 2026).

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let VetAppointment: any;
let PetInvite: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  process.env.PET_INVITE_HOURLY_LIMIT = '1000';
  process.env.VET_APPT_HOURLY_LIMIT = '1000';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
  VetAppointment = (await import('../models/vetAppointment.model')).VetAppointment;
  PetInvite = (await import('../models/petInvite.model')).PetInvite;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const id = () => new mongoose.Types.ObjectId().toHexString();
const ownerId = id();
const otroId = id();
const vetId = id();
const shelterId = id();
const H = (u: string, role = 'tenant') => ({ 'x-user-id': u, 'x-user-role': role, 'x-user-verified': 'true' });

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) await mongoose.connection.db.dropDatabase();
  await User.create([
    { _id: ownerId, name: 'Ana López', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: otroId, name: 'Pablo', email: 'pablo@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: vetId, name: 'CentroVet', email: 'vet@test.com', passwordHash: 'x', role: 'vet' },
    { _id: shelterId, name: 'Protectora', email: 'prote@test.com', passwordHash: 'x', role: 'landlord' },
  ]);
});

async function mascota() {
  return (await request(app).post('/api/animals/personal').set(H(ownerId)).send({ name: 'Luna', species: 'perro', age: '3 años' }).expect(201)).body;
}
const pedir = (u: string, when: Date) =>
  request(app).post('/api/vet-appointments').set(H(u)).send({ vetId, reason: 'Revisión', requestedAt: when.toISOString() });
const estado = (apptId: string, body: any) =>
  request(app).patch(`/api/vet-appointments/${apptId}/status`).set(H(vetId, 'vet')).send(body);

describe('FAC-128 · vuelta de Stripe en donaciones', () => {
  it('vuelve a /donate, la página que existe', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/donations.routes.ts'), 'utf8');
    expect(src).toContain("success_url: base + '/donate?donation=success&session_id={CHECKOUT_SESSION_ID}'");
    expect(src).toContain("cancel_url: base + '/donate?donation=cancel'");
    expect(src).not.toMatch(/'\/donations\?/);
  });
});

describe('FAC-129 · protectora de origen de un animal adoptado', () => {
  it('ve la cronología sin detalle privado; la familia la ve completa', async () => {
    const a = await Animal.create({
      name: 'Toby', species: 'dog', age: '2 años', shelter: shelterId, ownerId, isPersonalPet: true, status: 'adoptado', createdByRole: 'tenant',
      healthHistory: [{ type: 'medication', date: new Date(), notes: 'Antibiótico' }],
    });
    const prote = (await request(app).get(`/api/animals/${a.code}/timeline`).set(H(shelterId, 'landlord')).expect(200)).body.timeline;
    expect(prote.find((t: any) => t.kind === 'medication').detail).toBeFalsy();
    const fam = (await request(app).get(`/api/animals/${a.code}/timeline`).set(H(ownerId)).expect(200)).body.timeline;
    expect(fam.find((t: any) => t.kind === 'medication').detail).toBe('Antibiótico');
  });
});

describe('FAC-130 · el hueco sigue a la hora real de la cita', () => {
  it('mismo minuto con distintos segundos: una sola cita', async () => {
    const h = hueco(0);
    const rs = await Promise.all([pedir(ownerId, h), pedir(otroId, new Date(h.getTime() + 30_000))]);
    expect(rs.map(r => r.status).sort()).toEqual([201, 409]);
  });

  it('confirmar a otra hora suelta la pedida y ocupa la nueva', async () => {
    const a = (await pedir(ownerId, hueco(0)).expect(201)).body;
    await estado(a._id, { status: 'confirmed', scheduledAt: hueco(1).toISOString() }).expect(200);
    await pedir(otroId, hueco(0)).expect(201);
    const r = await pedir(otroId, hueco(1));
    expect(r.status).toBe(409);
  });

  it('reprogramar a una hora ya pedida da 409 y no cambia la cita', async () => {
    const a = (await pedir(ownerId, hueco(0)).expect(201)).body;
    await pedir(otroId, hueco(1)).expect(201);
    const r = await estado(a._id, { status: 'rescheduled', scheduledAt: hueco(1).toISOString() });
    expect(r.status).toBe(409);
    expect((await VetAppointment.findById(a._id).lean()).status).toBe('requested');
  });
});

describe('FAC-132 · el vet escribe solo con una cita aceptada o reciente', () => {
  const apuntar = (code: string) => request(app).post(`/api/animals/${code}/health`).set(H(vetId, 'vet')).send({ category: 'checkup', note: 'Bien' });
  const cita = (pet: any, extra: any) => VetAppointment.create({ vetId, userId: ownerId, animalId: pet._id, animalCode: pet.code, reason: 'x', requestedAt: new Date(), ...extra });

  it('pedida: no; confirmada: sí', async () => {
    const pet = await mascota();
    const c = await cita(pet, { status: 'requested' });
    await apuntar(pet.code).expect(403);
    await VetAppointment.updateOne({ _id: c._id }, { status: 'confirmed' });
    await apuntar(pet.code).expect(201);
  });

  it('completada hace 40 días: no; hace 5: sí', async () => {
    const pet = await mascota();
    const c = await cita(pet, { status: 'completed', scheduledAt: new Date(Date.now() - 40 * 86_400_000) });
    await apuntar(pet.code).expect(403);
    await VetAppointment.updateOne({ _id: c._id }, { scheduledAt: new Date(Date.now() - 5 * 86_400_000) });
    await apuntar(pet.code).expect(201);
  });
});

describe('FAC-135 · el pasaporte público solo detalla vacunas y desparasitaciones', () => {
  it('revisiones y notas libres sin detalle; la vacuna, con él', async () => {
    const pet = await mascota();
    for (const [category, note] of [['checkup', 'Soplo leve'], ['other', 'Ansiedad'], ['vaccine', 'Rabia']]) {
      await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ category, note }).expect(201);
    }
    const pub = (await request(app).get(`/api/animals/passport/${pet.code}`).expect(200)).body.timeline;
    const de = (k: string) => pub.find((t: any) => t.kind === k);
    expect(de('checkup').detail).toBeFalsy();
    expect(de('other').detail).toBeFalsy();
    expect(de('vaccine').detail).toBe('Rabia');
  });
});

describe('FAC-136 · hora de España en los recordatorios', () => {
  it('fmtDate de los recordatorios pone la hora peninsular', async () => {
    const { fmtDate } = await import('../jobs/reminders');
    expect(fmtDate(new Date('2026-07-10T10:00:00Z'))).toContain('12:00');
  });
});

describe('Invitaciones solo con el enlace del correo', () => {
  it('aceptar dos veces a la vez con el mismo enlace y la misma persona: las dos bien, un solo miembro', async () => {
    const pet = await mascota();
    const { token } = (await request(app).post(`/api/animals/${pet._id}/family/invites`).set(H(ownerId)).send({ email: 'pablo@test.com' }).expect(201)).body;
    const rs = await Promise.all([1, 2].map(() => request(app).post('/api/pet-invites/accept').set(H(otroId)).send({ token })));
    expect(rs.map(r => r.status)).toEqual([200, 200]);
    expect((await Animal.findById(pet._id).lean()).members).toHaveLength(1);
  });

  it('por id no se acepta ni se rechaza', async () => {
    const pet = await mascota();
    const { id: inviteId } = (await request(app).post(`/api/animals/${pet._id}/family/invites`).set(H(ownerId)).send({ email: 'pablo@test.com' }).expect(201)).body;
    await request(app).post('/api/pet-invites/accept').set(H(otroId)).send({ inviteId }).expect(404);
    await request(app).post('/api/pet-invites/decline').set(H(otroId)).send({ inviteId }).expect(404);
    expect((await PetInvite.findById(inviteId).lean()).status).toBe('pending');
  });
});
