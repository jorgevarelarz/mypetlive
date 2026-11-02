import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendSms: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/push', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

import { sendEmail } from '../utils/notification';
import { sendPushToUser } from '../utils/push';

// Mascota compartida: dos personas (pareja, hijos…) llevan la misma mascota.
// Una es la dueña (`ownerId`) e invita; la otra entra por invitación (`members`)
// y la cuida igual, salvo invitar/quitar gente y despedirla en el mural.

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let PetInvite: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  process.env.FRONTEND_URL = 'https://mypetlive.es';
  process.env.PET_INVITE_HOURLY_LIMIT = '1000';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
  PetInvite = (await import('../models/petInvite.model')).PetInvite;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const ownerId = new mongoose.Types.ObjectId().toHexString();
const partnerId = new mongoose.Types.ObjectId().toHexString();
const strangerId = new mongoose.Types.ObjectId().toHexString();
const shelterId = new mongoose.Types.ObjectId().toHexString();

const H = (id: string, role = 'tenant') => ({ 'x-user-id': id, 'x-user-role': role, 'x-user-verified': 'true' });
const ownerH = H(ownerId);
const partnerH = H(partnerId);
const strangerH = H(strangerId);
const shelterH = H(shelterId, 'landlord');

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  (sendEmail as jest.Mock).mockClear();
  (sendPushToUser as jest.Mock).mockClear();
  await User.create([
    { _id: ownerId, name: 'Ana López', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: partnerId, name: 'Pablo Ruiz', email: 'pablo@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: strangerId, name: 'Curioso', email: 'curioso@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: shelterId, name: 'Protectora', email: 'prote@test.com', passwordHash: 'x', role: 'landlord' },
  ]);
});

async function waitFor(assertion: () => void, timeoutMs = 2000) {
  const started = Date.now();
  for (;;) {
    try {
      assertion();
      return;
    } catch (err) {
      if (Date.now() - started > timeoutMs) throw err;
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
}

async function createPet() {
  const res = await request(app)
    .post('/api/animals/personal')
    .set(ownerH)
    .send({ name: 'Luna', species: 'perro', age: '3 años', sex: 'female', size: 'medium' })
    .expect(201);
  return res.body;
}

async function invite(petId: string, email = 'pablo@test.com') {
  const res = await request(app).post(`/api/animals/${petId}/family/invites`).set(ownerH).send({ email }).expect(201);
  return res.body as { id: string; token: string };
}

async function sharedPet() {
  const pet = await createPet();
  const { token } = await invite(pet._id);
  await request(app).post('/api/pet-invites/accept').set(partnerH).send({ token }).expect(200);
  return pet;
}

describe('Invitar', () => {
  it('el dueño invita por correo: sale el enlace al correo y un aviso al móvil si ya tiene cuenta', async () => {
    const pet = await createPet();
    const { token } = await invite(pet._id, 'Pablo@Test.com');

    const [to, subject, text] = (sendEmail as jest.Mock).mock.calls[0];
    expect(to).toBe('pablo@test.com');
    expect(subject).toContain('Luna');
    expect(text).toContain(`https://mypetlive.es/compartir/${token}`);
    expect(sendPushToUser).toHaveBeenCalledWith(partnerId, expect.objectContaining({ url: '/pet' }));

    // En la base solo el hash: una copia de la BD no sirve para entrar.
    const stored = await PetInvite.findOne({ animalId: pet._id }).lean();
    expect(stored.tokenHash).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('nadie más puede invitar ni ver quién la cuida', async () => {
    const pet = await createPet();
    await request(app).post(`/api/animals/${pet._id}/family/invites`).set(strangerH).send({ email: 'x@test.com' }).expect(403);
    await request(app).get(`/api/animals/${pet._id}/family`).set(strangerH).expect(403);
  });

  it('no se invita a uno mismo, ni a quien ya está, ni a una cuenta de protectora', async () => {
    const pet = await sharedPet();
    await request(app).post(`/api/animals/${pet._id}/family/invites`).set(ownerH).send({ email: 'ana@test.com' }).expect(400);
    await request(app).post(`/api/animals/${pet._id}/family/invites`).set(ownerH).send({ email: 'pablo@test.com' }).expect(409);
    // A una cuenta de protectora se le crea y envía como a cualquiera (AUD-3): así
    // no se distingue qué correos son profesionales. Aceptarla da 403.
    const { token } = (await request(app).post(`/api/animals/${pet._id}/family/invites`).set(ownerH).send({ email: 'prote@test.com' }).expect(201)).body;
    expect(await PetInvite.countDocuments({ animalId: pet._id, email: 'prote@test.com', status: 'pending' })).toBe(1);
    const fam = (await request(app).get(`/api/animals/${pet._id}/family`).set(ownerH).expect(200)).body;
    expect(JSON.stringify(fam)).toContain('prote@test.com');
    const r = await request(app).post('/api/pet-invites/accept').set({ 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' }).send({ token }).expect(403);
    expect(r.body.error).toBe('invitee_not_family');
    await request(app).post(`/api/animals/${pet._id}/family/invites`).set(ownerH).send({ email: 'no-es-correo' }).expect(400);
  });

  it('tope de personas, contando las invitaciones pendientes', async () => {
    const pet = await createPet();
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await invite(pet._id, `persona${i}@test.com`);
    }
    const res = await request(app).post(`/api/animals/${pet._id}/family/invites`).set(ownerH).send({ email: 'sexta@test.com' }).expect(409);
    expect(res.body.error).toBe('too_many_members');
  });

  it('reenviar a la misma persona anula el enlace anterior', async () => {
    const pet = await createPet();
    const first = await invite(pet._id);
    await invite(pet._id);
    const res = await request(app).post('/api/pet-invites/accept').set(partnerH).send({ token: first.token }).expect(410);
    expect(res.body.error).toBe('invite_revoked');
  });
});

describe('Aceptar', () => {
  it('la vista previa del enlace funciona sin sesión y no enseña el correo entero', async () => {
    const pet = await createPet();
    const { token } = await invite(pet._id);
    const res = await request(app).get(`/api/pet-invites/token/${token}`).expect(200);
    expect(res.body).toMatchObject({ status: 'pending', invitedBy: 'Ana', animal: { name: 'Luna' } });
    expect(res.body.email).not.toBe('pablo@test.com');
    expect(JSON.stringify(res.body)).not.toContain('ana@test.com');
    await request(app).get('/api/pet-invites/token/inventado').expect(404);
  });

  it('al aceptar le aparece en sus mascotas, con quién se la compartió; el dueño se entera', async () => {
    const pet = await sharedPet();
    const mine = await request(app).get('/api/animals/mine').set(partnerH).expect(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({ type: 'personal', role: 'member', sharedBy: 'Ana' });
    expect(String(mine.body.items[0].animal._id)).toBe(String(pet._id));
    expect(sendPushToUser).toHaveBeenCalledWith(ownerId, expect.objectContaining({ title: expect.stringContaining('Pablo') }));

    const ownerMine = await request(app).get('/api/animals/mine').set(ownerH).expect(200);
    expect(ownerMine.body.items[0].role).toBe('owner');
  });

  it('un enlace sirve una vez: otra cuenta ya no puede usarlo', async () => {
    const pet = await createPet();
    const { token } = await invite(pet._id);
    await request(app).post('/api/pet-invites/accept').set(partnerH).send({ token }).expect(200);
    await request(app).post('/api/pet-invites/accept').set(partnerH).send({ token }).expect(200); // idempotente
    await request(app).post('/api/pet-invites/accept').set(strangerH).send({ token }).expect(410);
  });

  // Decisión de Jorge (AUD-3): solo con el enlace del correo. Ni lista en la app
  // ni aceptar o rechazar por id, tampoco la persona invitada.
  it('desde la app ya no se listan ni se aceptan por id: solo con el enlace', async () => {
    const pet = await createPet();
    const { id, token } = await invite(pet._id);
    expect((await request(app).get('/api/pet-invites/mine').set(partnerH).expect(200)).body.items).toHaveLength(0);
    await request(app).post('/api/pet-invites/accept').set(partnerH).send({ inviteId: id }).expect(404);
    await request(app).post('/api/pet-invites/decline').set(partnerH).send({ inviteId: id }).expect(404);
    await request(app).post('/api/pet-invites/accept').set(partnerH).send({ token }).expect(200);
  });

  it('rechazarla la cierra', async () => {
    const pet = await createPet();
    const { token } = await invite(pet._id);
    await request(app).post('/api/pet-invites/decline').set(partnerH).send({ token }).expect(200);
    await request(app).post('/api/pet-invites/accept').set(partnerH).send({ token }).expect(410);
  });

  it('caducada no vale', async () => {
    const pet = await createPet();
    const { token } = await invite(pet._id);
    await PetInvite.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(app).post('/api/pet-invites/accept').set(partnerH).send({ token }).expect(410);
    expect(res.body.error).toBe('invite_expired');
  });

  it('una cuenta de protectora no puede entrar como familia', async () => {
    const pet = await createPet();
    const { token } = await invite(pet._id, 'otra@test.com');
    await request(app).post('/api/pet-invites/accept').set(shelterH).send({ token }).expect(403);
  });
});

describe('Lo que puede hacer quien la comparte', () => {
  it('la cuida como el dueño: ficha, comida, salud y modo perdido', async () => {
    const pet = await sharedPet();
    await request(app).put(`/api/animals/mine/${pet._id}`).set(partnerH).send({ name: 'Luna Mora' }).expect(200);
    await request(app).post(`/api/animals/${pet._id}/care/feed`).set(partnerH).send({}).expect(res => {
      if (res.status >= 400) throw new Error(`feed ${res.status} ${JSON.stringify(res.body)}`);
    });
    await request(app).post(`/api/animals/${pet.code}/health`).set(partnerH).send({ category: 'vaccine', note: 'Rabia' }).expect(res => {
      if (res.status >= 400) throw new Error(`health ${res.status} ${JSON.stringify(res.body)}`);
    });
    await request(app).post(`/api/animals/${pet._id}/lost`).set(partnerH).send({ area: 'Oleiros' }).expect(200);
    await request(app).get(`/api/animals/${pet._id}/sightings`).set(partnerH).expect(200);
  });

  it('pero no invita a nadie más ni la despide en el mural', async () => {
    const pet = await sharedPet();
    const inv = await request(app).post(`/api/animals/${pet._id}/family/invites`).set(partnerH).send({ email: 'x@test.com' }).expect(403);
    expect(inv.body.error).toBe('owner_only');
    await request(app).post(`/api/animals/${pet._id}/memorial`).set(partnerH).send({}).expect(403);
    await request(app).post(`/api/animals/${pet._id}/memorial`).set(ownerH).send({}).expect(200);
  });

  it('ve quién más la cuida, pero no las invitaciones pendientes', async () => {
    const pet = await sharedPet();
    await invite(pet._id, 'abuela@test.com');
    const asMember = await request(app).get(`/api/animals/${pet._id}/family`).set(partnerH).expect(200);
    expect(asMember.body.me).toBe('member');
    expect(asMember.body.owner.name).toBe('Ana López');
    expect(asMember.body.members.map((m: any) => m.userId)).toEqual([partnerId]);
    expect(asMember.body.invites).toEqual([]);

    const asOwner = await request(app).get(`/api/animals/${pet._id}/family`).set(ownerH).expect(200);
    expect(asOwner.body.me).toBe('owner');
    expect(asOwner.body.invites.map((i: any) => i.email)).toEqual(['abuela@test.com']);
  });

  it('si alguien la ve estando perdida, el aviso llega a los dos', async () => {
    const pet = await sharedPet();
    await request(app).post(`/api/animals/${pet._id}/lost`).set(ownerH).send({ area: 'Sada' }).expect(200);
    (sendEmail as jest.Mock).mockClear();
    (sendPushToUser as jest.Mock).mockClear();
    await request(app).post(`/api/animals/passport/${pet.code}/sighting`).send({ note: 'Está en el parque' }).expect(201);
    await waitFor(() => {
      const to = (sendEmail as jest.Mock).mock.calls.map(c => c[0]).sort();
      expect(to).toEqual(['ana@test.com', 'pablo@test.com']);
    });
    const pushed = (sendPushToUser as jest.Mock).mock.calls.map(c => c[0]).sort();
    expect(pushed).toEqual([ownerId, partnerId].sort());
  });

  it('el recordatorio de la vacuna también le llega', async () => {
    const pet = await sharedPet();
    const soon = new Date(Date.now() + 3 * 24 * 3_600_000).toISOString();
    await request(app).post(`/api/animals/${pet.code}/health`).set(ownerH).send({ category: 'vaccine', note: 'Rabia', nextDueAt: soon }).expect(res => {
      if (res.status >= 400) throw new Error(`health ${res.status}`);
    });
    (sendEmail as jest.Mock).mockClear();
    const { sendHealthDueReminders } = await import('../jobs/reminders');
    await sendHealthDueReminders();
    const to = (sendEmail as jest.Mock).mock.calls.map(c => c[0]).sort();
    expect(to).toEqual(['ana@test.com', 'pablo@test.com']);
  });

  it('el pasaporte público no dice con quién se comparte', async () => {
    const pet = await sharedPet();
    const res = await request(app).get(`/api/animals/passport/${pet.code}`).expect(200);
    expect(JSON.stringify(res.body)).not.toContain(partnerId);
    expect(res.body.members).toBeUndefined();
  });
});

describe('Quitar acceso', () => {
  it('el dueño quita a alguien y deja de poder tocarla', async () => {
    const pet = await sharedPet();
    await request(app).delete(`/api/animals/${pet._id}/family/members/${partnerId}`).set(ownerH).expect(200);
    await request(app).put(`/api/animals/mine/${pet._id}`).set(partnerH).send({ name: 'X' }).expect(403);
    expect((await request(app).get('/api/animals/mine').set(partnerH)).body.items).toHaveLength(0);
  });

  it('quien la comparte puede salirse, pero no quitar a otros', async () => {
    const pet = await sharedPet();
    await request(app).delete(`/api/animals/${pet._id}/family/members/${ownerId}`).set(partnerH).expect(403);
    await request(app).delete(`/api/animals/${pet._id}/family/members/me`).set(partnerH).expect(200);
    const doc = await Animal.findById(pet._id).lean();
    expect(doc.members).toHaveLength(0);
  });

  it('el dueño anula una invitación pendiente', async () => {
    const pet = await createPet();
    const { id, token } = await invite(pet._id);
    await request(app).delete(`/api/animals/${pet._id}/family/invites/${id}`).set(ownerH).expect(200);
    await request(app).post('/api/pet-invites/accept').set(partnerH).send({ token }).expect(410);
  });

  it('si el dueño borra su cuenta, la mascota pasa a quien la compartía en vez de archivarse', async () => {
    const pet = await sharedPet();
    const { deleteAccount } = await import('../utils/accountDeletion');
    await deleteAccount(ownerId);
    const doc = await Animal.findById(pet._id).lean();
    expect(String(doc.ownerId)).toBe(partnerId);
    expect(String(doc.shelter)).toBe(partnerId);
    expect(doc.members).toHaveLength(0);
    expect(doc.status).not.toBe('archivado');
    await request(app).put(`/api/animals/mine/${pet._id}`).set(partnerH).send({ name: 'Luna' }).expect(200);
  });

  it('si borra su cuenta quien la compartía, sale de la mascota', async () => {
    const pet = await sharedPet();
    const { deleteAccount } = await import('../utils/accountDeletion');
    await deleteAccount(partnerId);
    const doc = await Animal.findById(pet._id).lean();
    expect(String(doc.ownerId)).toBe(ownerId);
    expect(doc.members).toHaveLength(0);
  });
});
