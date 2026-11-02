import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendSms: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/push', () => ({ sendPushToUser: jest.fn().mockResolvedValue(undefined) }));

// Arreglos de la auditoría AUD-2 de la fábrica (2 nov 2026), uno por bloque.

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let VetAppointment: any;
let PetInvite: any;
let madridToDate: (ymd: string, hhmm: string) => Date;

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
  madridToDate = (await import('../utils/vetAgenda')).madridToDate;
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
function lunesQueViene() {
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const sumarDias = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pedir = (u: string, when: Date, extra: any = {}) =>
  request(app).post('/api/vet-appointments').set(H(u)).send({ vetId, reason: 'Revisión', requestedAt: when.toISOString(), ...extra });

describe('FAC-116 · veterinario sin relación con el animal', () => {
  it('sin cita con el animal no apunta nada; con cita, sí', async () => {
    const pet = await mascota();
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(vetId, 'vet')).send({ category: 'vaccine', note: 'Rabia' }).expect(403);
    expect((await Animal.findById(pet._id).lean()).healthHistory).toHaveLength(0);
    await VetAppointment.create({ vetId, userId: ownerId, animalId: pet._id, animalCode: pet.code, reason: 'x', requestedAt: new Date(), status: 'confirmed' });
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(vetId, 'vet')).send({ category: 'vaccine', note: 'Rabia' }).expect(201);
  });
});

describe('FAC-117 · protectora de origen de un animal adoptado', () => {
  it('ya no apunta cuidados ni pide citas para él', async () => {
    const a = await Animal.create({ name: 'Toby', species: 'dog', age: '2 años', shelter: shelterId, ownerId, isPersonalPet: true, status: 'adoptado', createdByRole: 'tenant' });
    await request(app).post(`/api/animals/${a._id}/care/feed`).set(H(shelterId, 'landlord')).send({}).expect(403);
    const r = await request(app).post('/api/vet-appointments').set(H(shelterId, 'landlord'))
      .send({ vetId, reason: 'x', requestedAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), animalCode: a.code });
    expect(r.status).toBe(403);
    await request(app).post(`/api/animals/${a._id}/care/feed`).set(H(ownerId)).send({}).expect(res => { if (res.status >= 400) throw new Error(String(res.status)); });
  });
});

describe('FAC-118 · invitación a un correo sin cuenta', () => {
  it('una cuenta creada después con ese correo no la ve ni la acepta por id; con el enlace, sí', async () => {
    const pet = await mascota();
    const { id: inviteId, token } = (await request(app).post(`/api/animals/${pet._id}/family/invites`).set(H(ownerId)).send({ email: 'nuevo@test.com' }).expect(201)).body;
    const nuevo = id();
    await User.create({ _id: nuevo, name: 'Nuevo', email: 'nuevo@test.com', passwordHash: 'x', role: 'tenant' });
    expect((await request(app).get('/api/pet-invites/mine').set(H(nuevo))).body.items).toHaveLength(0);
    await request(app).post('/api/pet-invites/accept').set(H(nuevo)).send({ inviteId }).expect(404);
    await request(app).post('/api/pet-invites/accept').set(H(nuevo)).send({ token }).expect(200);
  });
});

describe('FAC-119 · tokens en la ruta', () => {
  it('no salen en los registros', async () => {
    const { sanitizeUrl } = await import('../metrics');
    expect(sanitizeUrl('/api/pet-invites/token/abc123')).toBe('/api/pet-invites/token/[oculto]');
    expect(sanitizeUrl('/api/vets/calendar/abc123.ics')).toBe('/api/vets/calendar/[oculto].ics');
    expect(sanitizeUrl('/api/vets/calendar/abc123.ics?x=1')).not.toContain('abc123');
    expect(sanitizeUrl('/api/animals?token=zzz')).not.toContain('zzz');
  });
});

describe('FAC-120 / FAC-124 · huecos de la agenda', () => {
  it('rechaza domingos, sin margen, demasiado lejos y horas que no son de la agenda', async () => {
    await User.updateOne({ _id: vetId }, { $set: { 'profile.vet.agenda': { dias: [1, 2, 3, 4, 5], horas: ['10:00', '11:00'] } } });
    const lunes = lunesQueViene();
    for (const when of [
      madridToDate(sumarDias(lunes, 6), '10:00'), // domingo
      new Date(Date.now() + 30 * 60_000), // dentro de media hora
      madridToDate(sumarDias(lunes, 90), '10:00'), // más de 62 días
      madridToDate(lunes, '10:07'), // fuera de la agenda
    ]) {
      const r = await pedir(ownerId, when);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('slot_not_available');
    }
    await pedir(ownerId, madridToDate(lunes, '10:00')).expect(201);
  });

  it('dos peticiones a la vez al mismo hueco dejan una sola cita', async () => {
    const when = madridToDate(lunesQueViene(), '12:00');
    const rs = await Promise.all([pedir(ownerId, when), pedir(otroId, when)]);
    expect(rs.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await VetAppointment.countDocuments({ vetId })).toBe(1);
  });

  it('cancelar suelta el hueco', async () => {
    const when = madridToDate(lunesQueViene(), '16:00');
    const c = (await pedir(ownerId, when).expect(201)).body;
    await request(app).patch(`/api/vet-appointments/${c._id}/status`).set(H(ownerId)).send({ status: 'cancelled' }).expect(200);
    await pedir(otroId, when).expect(201);
  });

  it('como mucho 3 citas pendientes por persona y clínica', async () => {
    const lunes = lunesQueViene();
    for (const h of ['10:00', '11:00', '12:00']) await pedir(ownerId, madridToDate(lunes, h)).expect(201);
    const r = await pedir(ownerId, madridToDate(lunes, '13:00'));
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('too_many_pending');
  });
});

describe('FAC-121 · hora de España en correos', () => {
  it('fmtDate pone la hora peninsular', async () => {
    const { fmtDate } = await import('../controllers/vetAppointment.controller');
    expect(fmtDate('2026-11-12T11:00:00Z')).toContain('12:00');
    expect(fmtDate('2026-07-12T10:00:00Z')).toContain('12:00');
  });
});

describe('FAC-122 · Patitas reales de un cupón', () => {
  it('sin bonus propio, la API da la recompensa por defecto del servidor', async () => {
    const { COUPON_PATITAS_REWARD_DEFAULT } = await import('../utils/patitas');
    const Coupon = (await import('../models/coupon.model')).Coupon as any;
    await Coupon.create({ partnerId: vetId, partnerType: 'vet', title: 'Descuento', copy: '10 % en consulta', discount: '-10%', bonusPatitas: 0, active: true });
    const res = await request(app).get('/api/coupons').set(H(ownerId)).expect(200);
    const items = res.body.items || res.body;
    expect(items[0].rewardPatitas).toBe(COUPON_PATITAS_REWARD_DEFAULT);
  });
});

describe('FAC-123 y salud', () => {
  it('corregir el texto de una entrada con la próxima fecha vencida no falla ni reenvía el aviso', async () => {
    const pet = await mascota();
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ category: 'vaccine', note: 'Rabbia' }).expect(201);
    const vencida = new Date(Date.now() - 5 * 86_400_000);
    const sello = new Date(Date.now() - 12 * 86_400_000);
    await Animal.updateOne({ _id: pet._id }, { $set: { 'healthHistory.0.nextDueAt': vencida, 'healthHistory.0.reminderSentAt': sello } });
    const e = (await Animal.findById(pet._id).lean()).healthHistory[0];
    await request(app).patch(`/api/animals/${pet.code}/health/${e._id}`).set(H(ownerId)).send({ note: 'Rabia', nextDueAt: vencida.toISOString() }).expect(200);
    const d = (await Animal.findById(pet._id).lean()).healthHistory[0];
    expect(d.notes).toBe('Rabia');
    expect(new Date(d.reminderSentAt).getTime()).toBe(sello.getTime());
    await request(app).patch(`/api/animals/${pet.code}/health/${e._id}`).set(H(ownerId)).send({ nextDueAt: new Date(Date.now() - 86_400_000).toISOString() }).expect(400);
  });

  it('el alta recorta notas largas y rechaza fechas futuras', async () => {
    const pet = await mascota();
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ category: 'other', note: 'x'.repeat(2000) }).expect(201);
    expect((await Animal.findById(pet._id).lean()).healthHistory[0].notes).toHaveLength(500);
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ category: 'other', note: 'y', date: new Date(Date.now() + 10 * 86_400_000).toISOString() }).expect(400);
  });

  it('la familia no crea «visitas»: se guardan como revisión, que se puede corregir', async () => {
    const pet = await mascota();
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ category: 'visit', note: 'Chequeo' }).expect(201);
    const d = await Animal.findById(pet._id).lean();
    expect(d.vetHistory || []).toHaveLength(0);
    expect(d.healthHistory[0]).toMatchObject({ type: 'checkup', notes: 'Chequeo' });
  });

  it('el pasaporte público no enseña el detalle de la medicación', async () => {
    const pet = await mascota();
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ category: 'medication', note: 'Antibiótico 7 días' }).expect(201);
    const pass = await request(app).get(`/api/animals/passport/${pet.code}`).expect(200);
    expect(JSON.stringify(pass.body)).not.toContain('Antibiótico');
    expect(pass.body.timeline.some((t: any) => t.kind === 'medication')).toBe(true);
  });

  it('guardar solo la condición no cambia la fecha del peso', async () => {
    const pet = await mascota();
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ weightKg: 20 }).expect(200);
    const viejo = new Date(Date.now() - 90 * 86_400_000);
    await Animal.updateOne({ _id: pet._id }, { $set: { weightAt: viejo } });
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ weightKg: 20, bodyCondition: 'bueno' }).expect(200);
    expect(new Date((await Animal.findById(pet._id).lean()).weightAt).getTime()).toBe(viejo.getTime());
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ weightKg: 21 }).expect(200);
    expect(new Date((await Animal.findById(pet._id).lean()).weightAt).getTime()).toBeGreaterThan(viejo.getTime());
  });
});

describe('Mascota compartida', () => {
  async function compartida() {
    const pet = await mascota();
    const { token } = (await request(app).post(`/api/animals/${pet._id}/family/invites`).set(H(ownerId)).send({ email: 'pablo@test.com' }).expect(201)).body;
    await request(app).post('/api/pet-invites/accept').set(H(otroId)).send({ token }).expect(200);
    return pet;
  }

  it('un miembro no ve los correos de los demás; el dueño, sí', async () => {
    const pet = await compartida();
    const m = (await request(app).get(`/api/animals/${pet._id}/family`).set(H(otroId)).expect(200)).body;
    expect(m.owner.email).toBeUndefined();
    const o = (await request(app).get(`/api/animals/${pet._id}/family`).set(H(ownerId)).expect(200)).body;
    expect(o.members[0].email).toBe('pablo@test.com');
  });

  it('invitar a un correo de clínica responde igual y no crea nada', async () => {
    const pet = await mascota();
    await request(app).post(`/api/animals/${pet._id}/family/invites`).set(H(ownerId)).send({ email: 'vet@test.com' }).expect(201);
    expect(await PetInvite.countDocuments({ email: 'vet@test.com' })).toBe(0);
  });

  it('dos aceptaciones a la vez del mismo enlace dejan un solo miembro', async () => {
    const pet = await mascota();
    const tercero = id();
    await User.create({ _id: tercero, name: 'Tercero', email: 'tercero@test.com', passwordHash: 'x', role: 'tenant' });
    const { token } = (await request(app).post(`/api/animals/${pet._id}/family/invites`).set(H(ownerId)).send({ email: 'pablo@test.com' }).expect(201)).body;
    const rs = await Promise.all([
      request(app).post('/api/pet-invites/accept').set(H(otroId)).send({ token }),
      request(app).post('/api/pet-invites/accept').set(H(tercero)).send({ token }),
    ]);
    expect(rs.filter(r => r.status === 200)).toHaveLength(1);
    expect((await Animal.findById(pet._id).lean()).members).toHaveLength(1);
  });
});
