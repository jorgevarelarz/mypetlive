import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { citaCon } from './utils/citas';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendSms: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/push', () => ({ sendPushToUser: jest.fn().mockResolvedValue(undefined) }));

// Corregir o borrar una entrada del historial de salud (2 nov 2026): la familia
// lo suyo, la clínica lo suyo, y nadie lo de los demás.

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let ensureHealthEntryIds: () => Promise<number>;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  process.env.PET_INVITE_HOURLY_LIMIT = '1000';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  const animalModel = await import('../models/animal.model');
  Animal = animalModel.Animal;
  ensureHealthEntryIds = animalModel.ensureHealthEntryIds;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const ownerId = new mongoose.Types.ObjectId().toHexString();
const partnerId = new mongoose.Types.ObjectId().toHexString();
const strangerId = new mongoose.Types.ObjectId().toHexString();
const vetId = new mongoose.Types.ObjectId().toHexString();
const H = (id: string, role = 'tenant') => ({ 'x-user-id': id, 'x-user-role': role, 'x-user-verified': 'true' });

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) await mongoose.connection.db.dropDatabase();
  await User.create([
    { _id: ownerId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: partnerId, name: 'Pablo', email: 'pablo@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: strangerId, name: 'Curioso', email: 'curioso@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: vetId, name: 'CentroVet', email: 'vet@test.com', passwordHash: 'x', role: 'vet' },
  ]);
});

async function petWithVaccine() {
  const pet = (await request(app).post('/api/animals/personal').set(H(ownerId)).send({ name: 'Luna', species: 'perro', age: '3 años' }).expect(201)).body;
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ category: 'vaccine', note: 'Rabbia', nextDueAt: soon }).expect(201);
  const doc = await Animal.findById(pet._id).lean();
  return { pet, entry: doc.healthHistory[0] };
}

// Lo que sí llega a la ficha pública (GET /api/animals/:id): animales de protectora,
// también los ya adoptados. Las mascotas personales dan 404 en esa ruta.
const deProtectora = (extra: any) => Animal.create({
  name: 'Toby', species: 'perro', age: '2 años', status: 'publicado', shelter: partnerId, createdByRole: 'protectora', ...extra,
});

describe('Corregir el historial de salud', () => {
  it('cada entrada nueva lleva su id y quién la apuntó', async () => {
    const { entry } = await petWithVaccine();
    expect(entry._id).toBeTruthy();
    expect(entry.byRole).toBe('family');
  });

  it('la familia corrige el texto, el tipo y la próxima fecha; el aviso se rearma', async () => {
    const { pet, entry } = await petWithVaccine();
    await Animal.updateOne({ _id: pet._id }, { $set: { 'healthHistory.0.reminderSentAt': new Date() } });
    const next = new Date(Date.now() + 60 * 86_400_000).toISOString();
    await request(app).patch(`/api/animals/${pet.code}/health/${entry._id}`).set(H(ownerId))
      .send({ note: 'Rabia', category: 'deworming', nextDueAt: next }).expect(200);
    const doc = await Animal.findById(pet._id).lean();
    expect(doc.healthHistory[0]).toMatchObject({ notes: 'Rabia', type: 'deworming' });
    expect(new Date(doc.healthHistory[0].nextDueAt).toISOString()).toBe(next);
    expect(doc.healthHistory[0].reminderSentAt).toBeUndefined();
  });

  it('quitar la próxima fecha deja la entrada sin aviso', async () => {
    const { pet, entry } = await petWithVaccine();
    await request(app).patch(`/api/animals/${pet.code}/health/${entry._id}`).set(H(ownerId)).send({ nextDueAt: null }).expect(200);
    const doc = await Animal.findById(pet._id).lean();
    expect(doc.healthHistory[0].nextDueAt).toBeUndefined();
  });

  it('borrarla la quita del pasaporte público', async () => {
    const { pet, entry } = await petWithVaccine();
    const res = await request(app).delete(`/api/animals/${pet.code}/health/${entry._id}`).set(H(ownerId)).expect(200);
    expect(res.body.health.healthMilestones).toBe(0);
    const pass = await request(app).get(`/api/animals/passport/${pet.code}`).expect(200);
    expect(pass.body.timeline.some((t: any) => t.type === 'health')).toBe(false);
  });

  it('con quien se comparte la mascota también puede', async () => {
    const { pet, entry } = await petWithVaccine();
    const { token } = (await request(app).post(`/api/animals/${pet._id}/family/invites`).set(H(ownerId)).send({ email: 'pablo@test.com' }).expect(201)).body;
    await request(app).post('/api/pet-invites/accept').set(H(partnerId)).send({ token }).expect(200);
    await request(app).delete(`/api/animals/${pet.code}/health/${entry._id}`).set(H(partnerId)).expect(200);
  });

  it('nadie más puede tocarla', async () => {
    const { pet, entry } = await petWithVaccine();
    await request(app).patch(`/api/animals/${pet.code}/health/${entry._id}`).set(H(strangerId)).send({ note: 'x' }).expect(403);
    await request(app).delete(`/api/animals/${pet.code}/health/${entry._id}`).set(H(strangerId)).expect(403);
  });

  it('lo que apuntó la clínica no lo cambia la familia; la clínica sí', async () => {
    const { pet } = await petWithVaccine();
    await citaCon(vetId, pet);
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(vetId, 'vet')).send({ category: 'vaccine', note: 'Polivalente' }).expect(201);
    const doc = await Animal.findById(pet._id).lean();
    const vetEntry = doc.healthHistory.find((h: any) => h.notes === 'Polivalente');
    expect(vetEntry.byRole).toBe('vet');
    const res = await request(app).delete(`/api/animals/${pet.code}/health/${vetEntry._id}`).set(H(ownerId)).expect(403);
    expect(res.body.error).toBe('vet_record');
    await request(app).patch(`/api/animals/${pet.code}/health/${vetEntry._id}`).set(H(vetId, 'vet')).send({ note: 'Polivalente (lote 22)' }).expect(200);
  });

  it('no deja datos imposibles', async () => {
    const { pet, entry } = await petWithVaccine();
    const url = `/api/animals/${pet.code}/health/${entry._id}`;
    await request(app).patch(url).set(H(ownerId)).send({ note: '  ' }).expect(400);
    await request(app).patch(url).set(H(ownerId)).send({ category: 'visit' }).expect(400);
    await request(app).patch(url).set(H(ownerId)).send({ nextDueAt: '2020-01-01' }).expect(400);
    await request(app).patch(url).set(H(ownerId)).send({ date: new Date(Date.now() + 10 * 86_400_000).toISOString() }).expect(400);
    await request(app).patch(`/api/animals/${pet.code}/health/${new mongoose.Types.ObjectId()}`).set(H(ownerId)).send({ note: 'x' }).expect(404);
  });

  it('las entradas viejas reciben id y autor al arrancar, sin tocar las que ya los tienen', async () => {
    const { pet, entry } = await petWithVaccine();
    // Dos entradas «de antes»: sin _id ni byRole, una de la familia y otra de la clínica.
    await Animal.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(pet._id)) }, {
      $push: { healthHistory: { $each: [
        { date: new Date(), type: 'deworming', notes: 'Vieja familia', vetId: new mongoose.Types.ObjectId(ownerId) },
        { date: new Date(), type: 'vaccine', notes: 'Vieja clínica', vetId: new mongoose.Types.ObjectId(vetId) },
      ] } } as any,
    });
    expect(await ensureHealthEntryIds()).toBe(1);
    const doc = await Animal.findById(pet._id).lean();
    const byNote = Object.fromEntries(doc.healthHistory.map((h: any) => [h.notes, h]));
    expect(String(byNote.Rabbia._id)).toBe(String(entry._id));
    expect(byNote['Vieja familia']).toMatchObject({ byRole: 'family' });
    expect(byNote['Vieja clínica']).toMatchObject({ byRole: 'vet' });
    expect(byNote['Vieja familia']._id).toBeTruthy();
    expect(await ensureHealthEntryIds()).toBe(0);
  });

  it('medicación es un tipo más del historial, con su título en el pasaporte', async () => {
    const { pet } = await petWithVaccine();
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ category: 'medication', note: 'Antibiótico 7 días' }).expect(201);
    // Público: el título sí, el detalle no (AUD-2: la medicación es dato de salud privado).
    const pass = await request(app).get(`/api/animals/passport/${pet.code}`).expect(200);
    const med = pass.body.timeline.find((t: any) => t.kind === 'medication');
    expect(med).toMatchObject({ title: 'Medicación' });
    expect(med.detail).toBeFalsy();
    const propio = await request(app).get(`/api/animals/${pet.code}/timeline`).set(H(ownerId)).expect(200);
    expect(propio.body.timeline.find((t: any) => t.kind === 'medication')).toMatchObject({ title: 'Medicación', detail: 'Antibiótico 7 días' });
  });
});

describe('Pauta de la medicación', () => {
  const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
  const apuntar = async (pet: any, extra: any = {}) => {
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId))
      .send({ category: 'medication', note: 'Amoxicilina', dose: '1 comprimido', frequency: 'every_12h', endsAt: dia(7), nextDueAt: null, ...extra }).expect(201);
    const doc = await Animal.findById(pet._id).lean();
    return doc.healthHistory[doc.healthHistory.length - 1];
  };

  it('guarda cantidad, frecuencia y fin, sin programar aviso de repetición', async () => {
    const { pet } = await petWithVaccine();
    const med = await apuntar(pet);
    expect(med).toMatchObject({ type: 'medication', notes: 'Amoxicilina', dose: '1 comprimido', frequency: 'every_12h' });
    expect(med.endsAt).toBeTruthy();
    expect(med.nextDueAt).toBeUndefined();
  });

  it('sin fecha de fin vale, y la app antigua sigue apuntando solo la nota', async () => {
    const { pet } = await petWithVaccine();
    expect((await apuntar(pet, { endsAt: null })).endsAt).toBeUndefined();
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ category: 'medication', note: 'Antiinflamatorio' }).expect(201);
  });

  it('rechaza una frecuencia desconocida y un fin anterior al inicio', async () => {
    const { pet } = await petWithVaccine();
    const base = { category: 'medication', note: 'Amoxicilina' };
    const mala = await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ ...base, frequency: 'a_veces' }).expect(400);
    expect(mala.body.error).toBe('invalid_frequency');
    const fin = await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ ...base, date: dia(-2), endsAt: dia(-5) }).expect(400);
    expect(fin.body.error).toBe('ends_before_start');
  });

  it('un tratamiento de un solo día empieza y acaba la misma fecha', async () => {
    const { pet } = await petWithVaccine();
    await apuntar(pet, { date: dia(-1), endsAt: dia(-1) });
  });

  it('la pauta no se guarda en otros tipos y se borra si deja de ser medicación', async () => {
    const { pet } = await petWithVaccine();
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId)).send({ category: 'checkup', note: 'Revisión', dose: '5 ml', frequency: 'daily' }).expect(201);
    let doc = await Animal.findById(pet._id).lean();
    expect(doc.healthHistory[1].dose).toBeUndefined();
    const med = await apuntar(pet);
    await request(app).patch(`/api/animals/${pet.code}/health/${med._id}`).set(H(ownerId)).send({ category: 'other' }).expect(200);
    doc = await Animal.findById(pet._id).lean();
    const corregida = doc.healthHistory.find((h: any) => String(h._id) === String(med._id));
    expect(corregida.dose).toBeUndefined();
    expect(corregida.frequency).toBeUndefined();
    expect(corregida.endsAt).toBeUndefined();
  });

  it('se corrige la pauta y se le puede quitar la fecha de fin', async () => {
    const { pet } = await petWithVaccine();
    const med = await apuntar(pet);
    await request(app).patch(`/api/animals/${pet.code}/health/${med._id}`).set(H(ownerId)).send({ dose: '2 comprimidos', frequency: 'every_8h', endsAt: null }).expect(200);
    const doc = await Animal.findById(pet._id).lean();
    const corregida = doc.healthHistory.find((h: any) => String(h._id) === String(med._id));
    expect(corregida).toMatchObject({ dose: '2 comprimidos', frequency: 'every_8h' });
    expect(corregida.endsAt).toBeUndefined();
  });

  it('la pauta la ve la familia, pero no sale en el pasaporte público ni en la ficha', async () => {
    const { pet } = await petWithVaccine();
    await apuntar(pet, { endsAt: null });
    const propio = await request(app).get(`/api/animals/${pet.code}/timeline`).set(H(ownerId)).expect(200);
    expect(propio.body.timeline.find((t: any) => t.kind === 'medication').detail).toBe('Amoxicilina · 1 comprimido · cada 12 horas');
    const pass = await request(app).get(`/api/animals/passport/${pet.code}`).expect(200);
    expect(JSON.stringify(pass.body)).not.toContain('Amoxicilina');
    expect(JSON.stringify(pass.body)).not.toContain('1 comprimido');
    const animal = await deProtectora({ healthHistory: [{ type: 'medication', notes: 'Amoxicilina', dose: '1 comprimido', frequency: 'every_12h', endsAt: new Date() }] });
    const ficha = await request(app).get(`/api/animals/${animal._id}`).set(H(strangerId)).expect(200);
    expect(ficha.body.healthHistory).toHaveLength(1);
    for (const privado of ['Amoxicilina', '1 comprimido', 'every_12h', 'endsAt']) expect(JSON.stringify(ficha.body)).not.toContain(privado);
  });
});

describe('Tomas de la medicación', () => {
  const { tomasCerca } = jest.requireActual('../utils/medicationDoses');
  const push = () => jest.requireMock('../utils/push').sendPushToUser as jest.Mock;
  const conToma = async (primera: Date, extra: any = {}) => {
    const { pet } = await petWithVaccine();
    await request(app).post(`/api/animals/${pet.code}/health`).set(H(ownerId))
      .send({ category: 'medication', note: 'Amoxicilina', dose: '1 comprimido', frequency: 'every_8h', firstDoseAt: primera.toISOString(), nextDueAt: null, ...extra }).expect(201);
    const doc = await Animal.findById(pet._id).lean();
    return { pet, med: doc.healthHistory[doc.healthHistory.length - 1] };
  };
  const pasada = async (now: Date) => (await import('../jobs/reminders')).sendMedicationDoseReminders(now);

  beforeEach(() => push().mockClear());

  it('cada 8 horas son 8 horas exactas, también cuando cambia la hora', () => {
    const r = tomasCerca({ firstDoseAt: '2026-10-24T22:00:00Z', frequency: 'every_8h' }, new Date('2026-10-25T07:00:00Z'));
    expect(r.anterior.toISOString()).toBe('2026-10-25T06:00:00.000Z');
    expect(r.siguiente.toISOString()).toBe('2026-10-25T14:00:00.000Z');
  });

  it('una vez al día sigue a la misma hora de España al cambiar la hora', () => {
    // 8:00 en verano son las 6:00 UTC; tras el 25 de octubre, las 7:00 UTC.
    const r = tomasCerca({ firstDoseAt: '2026-10-20T06:00:00Z', frequency: 'daily' }, new Date('2026-10-27T12:00:00Z'));
    expect(r.anterior.toISOString()).toBe('2026-10-27T07:00:00.000Z');
  });

  it('una vez al mes respeta los meses cortos', () => {
    const r = tomasCerca({ firstDoseAt: '2026-01-31T09:00:00Z', frequency: 'monthly' }, new Date('2026-03-01T00:00:00Z'));
    expect(r.anterior.toISOString()).toBe('2026-02-28T09:00:00.000Z');
    expect(r.siguiente.toISOString()).toBe('2026-03-31T08:00:00.000Z');
  });

  it('no hay tomas después del último día ni en «solo si lo necesita»', () => {
    const fin = tomasCerca({ firstDoseAt: '2026-11-01T08:00:00Z', frequency: 'daily', endsAt: '2026-11-03T11:00:00Z' }, new Date('2026-11-03T09:00:00Z'));
    expect(fin.anterior.toISOString()).toBe('2026-11-03T08:00:00.000Z');
    expect(fin.siguiente).toBeNull();
    expect(tomasCerca({ firstDoseAt: '2026-11-01T08:00:00Z', frequency: 'as_needed' }, new Date())).toEqual({ anterior: null, siguiente: null });
  });

  it('avisa una vez por toma, a la familia y con el medicamento', async () => {
    const primera = new Date(Date.now() - 5 * 60_000);
    const { pet } = await conToma(primera);
    expect(await pasada(new Date())).toBe(1);
    expect(push()).toHaveBeenCalledWith(ownerId, expect.objectContaining({ title: expect.stringContaining('Luna'), body: 'Amoxicilina · 1 comprimido', url: `/cuidados?mascota=${pet._id}` }));
    expect(await pasada(new Date(Date.now() + 5 * 60_000))).toBe(0);
    // La siguiente toma vuelve a avisar.
    expect(await pasada(new Date(primera.getTime() + 8 * 3_600_000 + 60_000))).toBe(1);
  });

  it('no avisa sin hora, ni tarde, ni si ya está dada', async () => {
    await conToma(new Date(), { firstDoseAt: undefined });
    expect(await pasada(new Date())).toBe(0);
    await conToma(new Date(Date.now() - 2 * 3_600_000));
    expect(await pasada(new Date())).toBe(0);
    // Dada 10 minutos antes de su hora: esa toma ya no se avisa.
    const primera = new Date(Date.now() + 10 * 60_000);
    const { pet, med } = await conToma(primera);
    await request(app).post(`/api/animals/${pet.code}/health/${med._id}/dose`).set(H(ownerId)).expect(200);
    expect(await pasada(new Date(primera.getTime() + 60_000))).toBe(0);
    // La siguiente, sí.
    expect(await pasada(new Date(primera.getTime() + 8 * 3_600_000 + 60_000))).toBe(1);
  });

  it('no avisa de una mascota fallecida', async () => {
    const { pet } = await conToma(new Date(Date.now() - 60_000));
    await Animal.updateOne({ _id: pet._id }, { $set: { 'memorial.active': true } });
    expect(await pasada(new Date())).toBe(0);
  });

  it('marcar una toma: la familia sí, un extraño no, y solo en medicación', async () => {
    const { pet, med } = await conToma(new Date());
    await request(app).post(`/api/animals/${pet.code}/health/${med._id}/dose`).set(H(strangerId)).expect(403);
    await request(app).post(`/api/animals/${pet.code}/health/${med._id}/dose`).set(H(ownerId)).expect(200);
    const doc = await Animal.findById(pet._id).lean();
    expect(doc.healthHistory.find((h: any) => String(h._id) === String(med._id)).lastDoseAt).toBeTruthy();
    const vacuna = doc.healthHistory[0];
    await request(app).post(`/api/animals/${pet.code}/health/${vacuna._id}/dose`).set(H(ownerId)).expect(400);
  });

  it('la familia marca la toma aunque la pauta la pusiera la clínica', async () => {
    const { pet, med } = await conToma(new Date());
    await Animal.updateOne({ _id: pet._id, 'healthHistory._id': med._id }, { $set: { 'healthHistory.$.byRole': 'vet' } });
    await request(app).post(`/api/animals/${pet.code}/health/${med._id}/dose`).set(H(ownerId)).expect(200);
  });

  it('los datos de las tomas no salen en la ficha', async () => {
    const animal = await deProtectora({ healthHistory: [{ type: 'medication', notes: 'Amoxicilina', frequency: 'daily', firstDoseAt: new Date(), lastDoseAt: new Date(), doseReminderAt: new Date() }] });
    const ficha = await request(app).get(`/api/animals/${animal._id}`).set(H(strangerId)).expect(200);
    expect(ficha.body.healthHistory).toHaveLength(1);
    for (const campo of ['firstDoseAt', 'lastDoseAt', 'doseReminderAt']) expect(JSON.stringify(ficha.body)).not.toContain(campo);
  });
});

describe('Texto de salud en la ficha', () => {
  it('un animal ya adoptado solo enseña el texto de vacunas y desparasitaciones', async () => {
    const animal = await deProtectora({
      status: 'adoptado', ownerId,
      healthHistory: [{ type: 'vaccine', notes: 'Rabia' }, { type: 'deworming', notes: 'Pipeta' }, { type: 'checkup', notes: 'Soplo leve' }],
      vetHistory: [{ date: new Date(), note: 'Otitis', treatment: 'Gotas' }],
    });
    const ficha = await request(app).get(`/api/animals/${animal._id}`).set(H(strangerId)).expect(200);
    const texto = JSON.stringify(ficha.body);
    for (const privado of ['Soplo leve', 'Otitis', 'Gotas']) expect(texto).not.toContain(privado);
    expect(texto).toContain('Rabia');
    expect(texto).toContain('Pipeta');
    // Su familia lo ve todo.
    const propia = await request(app).get(`/api/animals/${animal._id}`).set(H(ownerId)).expect(200);
    expect(JSON.stringify(propia.body)).toContain('Soplo leve');
  });

  it('la ficha de adopción de una protectora conserva su texto, menos la medicación', async () => {
    const animal = await deProtectora({ healthHistory: [{ type: 'checkup', notes: 'Sano y sociable' }, { type: 'medication', notes: 'Prednisona', dose: '1 comprimido' }], vetHistory: [{ date: new Date(), note: 'Esterilizado' }] });
    const ficha = await request(app).get(`/api/animals/${animal._id}`).set(H(strangerId)).expect(200);
    const texto = JSON.stringify(ficha.body);
    expect(texto).toContain('Sano y sociable');
    expect(texto).toContain('Esterilizado');
    expect(texto).not.toContain('Prednisona');
    expect(texto).not.toContain('1 comprimido');
  });
});

describe('Sus datos de salud', () => {
  it('la familia apunta el peso y la condición; el peso lleva su fecha y se puede quitar', async () => {
    const { pet } = await petWithVaccine();
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ weightKg: 24.5, bodyCondition: 'bueno' }).expect(200);
    let doc = await Animal.findById(pet._id).lean();
    expect(doc).toMatchObject({ weightKg: 24.5, bodyCondition: 'bueno' });
    expect(doc.weightAt).toBeTruthy();
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ weightKg: null, bodyCondition: null }).expect(200);
    doc = await Animal.findById(pet._id).lean();
    expect(doc.weightKg).toBeUndefined();
    expect(doc.bodyCondition).toBeNull();
  });

  it('no acepta pesos ni condiciones imposibles', async () => {
    const { pet } = await petWithVaccine();
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ weightKg: -3 }).expect(400);
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ weightKg: 900 }).expect(400);
    await request(app).put(`/api/animals/mine/${pet._id}`).set(H(ownerId)).send({ bodyCondition: 'gordito' }).expect(400);
  });
});

