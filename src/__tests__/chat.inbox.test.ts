import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { startMongoMemoryReplicaSet } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/push', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
  pushConfigured: false,
}));

// Mensajes: bandeja, tarjetas de estado en el chat (adopción y cita del vet),
// visitas de adopción y el correo de «mensaje sin leer».

let app: any;
let mongo: MongoMemoryReplSet | undefined;
let User: any;
let Animal: any;
let Conversation: any;
let sendUnreadChatEmails: (now?: Date) => Promise<number>;
let sendEmail: jest.Mock;
let sendPushToUser: jest.Mock;

beforeAll(async () => {
  mongo = await startMongoMemoryReplicaSet();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
  Conversation = (await import('../models/conversation.model')).default;
  sendUnreadChatEmails = (await import('../jobs/chatEmails')).sendUnreadChatEmails;
  sendEmail = (await import('../utils/notification')).sendEmail as jest.Mock;
  sendPushToUser = (await import('../utils/push')).sendPushToUser as jest.Mock;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const id = () => new mongoose.Types.ObjectId().toHexString();
const shelterId = id();
const adopterId = id();
const strangerId = id();
const vetId = id();
const H = (uid: string, role: string) => ({ 'x-user-id': uid, 'x-user-role': role, 'x-user-verified': 'true' });
const shelterH = H(shelterId, 'landlord');
const adopterH = H(adopterId, 'tenant');
const strangerH = H(strangerId, 'tenant');
const vetH = H(vetId, 'vet');
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

let animalId: string;

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  sendEmail.mockClear();
  sendPushToUser.mockClear();
  await User.create([
    { _id: shelterId, name: 'Marta', email: 'norte@test.com', passwordHash: 'x', role: 'landlord', profile: { orgName: 'Protectora Norte' } },
    { _id: adopterId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: strangerId, name: 'Otro', email: 'otro@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: vetId, name: 'Pepe', email: 'vet@test.com', passwordHash: 'x', role: 'vet', profile: { orgName: 'Clínica Sur' } },
  ]);
  const animal = await Animal.create({
    name: 'Luna', species: 'dog', age: '2 años', shelter: shelterId, images: ['/uploads/luna.webp'],
    createdByRole: 'protectora', status: 'publicado', isPersonalPet: false,
  });
  animalId = String(animal._id);
});

async function apply() {
  const res = await request(app).post('/api/adoptions').set(adopterH).send({ animalId }).expect(201);
  return String(res.body.id);
}

async function inbox(headers: any) {
  return (await request(app).get('/api/chat/conversations').set(headers).expect(200)).body;
}

async function messages(headers: any, convId: string) {
  return (await request(app).get(`/api/chat/${convId}/messages`).set(headers).expect(200)).body;
}

describe('Mensajes: adopción', () => {
  it('la solicitud abre la conversación con la protectora, con su tarjeta', async () => {
    const adoptionId = await apply();

    const [conv] = await inbox(shelterH);
    expect(conv.context).toMatchObject({ type: 'adoption', adoptionId, status: 'recibida', role: 'shelter' });
    expect(conv.other.name).toBe('Ana');
    expect(conv.animal).toMatchObject({ name: 'Luna', photo: '/uploads/luna.webp' });
    expect(conv.unreadForMe).toBe(1);
    expect(conv.lastMessage).toMatchObject({ type: 'system', systemCode: 'adoption.created' });

    // Para el adoptante la conversación existe, pero lo suyo no cuenta como no leído.
    const [mine] = await inbox(adopterH);
    expect(mine.other.name).toBe('Protectora Norte');
    expect(mine.unreadForMe).toBe(0);
    expect((await inbox(strangerH))).toHaveLength(0);
  });

  it('cada cambio de estado deja una tarjeta en el chat', async () => {
    const adoptionId = await apply();
    await request(app).patch(`/api/adoptions/${adoptionId}/status`).set(shelterH).send({ status: 'en_revision' }).expect(200);
    const [conv] = await inbox(adopterH);
    const msgs = await messages(adopterH, conv._id);
    expect(msgs[0]).toMatchObject({ type: 'system', systemCode: 'adoption.status', payload: { status: 'en_revision' } });
    expect(msgs[0].body).toContain('en revisión');
    expect(conv.unreadForMe).toBe(1);
  });

  it('la protectora propone visita y el adoptante la acepta', async () => {
    const adoptionId = await apply();
    const at = inDays(3);
    const res = await request(app).post(`/api/adoptions/${adoptionId}/visit`).set(shelterH)
      .send({ at, place: 'Refugio de Lugo', note: 'Trae a tu perro si tienes' }).expect(200);
    // Desde «recibida» pasa a «cita propuesta», y el animal queda reservado.
    expect(res.body.status).toBe('cita_propuesta');
    expect((await Animal.findById(animalId).lean()).status).toBe('reservado');

    const [conv] = await inbox(adopterH);
    expect(conv.context.visit).toMatchObject({ status: 'propuesta', place: 'Refugio de Lugo' });
    const [card] = await messages(adopterH, conv._id);
    expect(card).toMatchObject({ systemCode: 'adoption.visit', payload: { place: 'Refugio de Lugo', isNew: true } });
    expect(sendPushToUser).toHaveBeenCalledWith(adopterId, expect.objectContaining({ url: `/citas?visita=${adoptionId}` }));

    // Nadie más que el adoptante la acepta; la protectora tampoco.
    await request(app).post(`/api/adoptions/${adoptionId}/visit/accept`).set(strangerH).expect(403);
    await request(app).post(`/api/adoptions/${adoptionId}/visit/accept`).set(shelterH).expect(403);
    await request(app).post(`/api/adoptions/${adoptionId}/visit/accept`).set(adopterH).expect(200);
    const [accepted] = await messages(shelterH, conv._id);
    expect(accepted.systemCode).toBe('adoption.visit_accepted');

    // Sale en Citas de los dos.
    const mine = await request(app).get('/api/adoptions/visits/mine').set(adopterH).expect(200);
    expect(mine.body.items).toEqual([expect.objectContaining({ adoptionId, shelterName: 'Protectora Norte', visit: expect.objectContaining({ status: 'aceptada' }) })]);
    const theirs = await request(app).get('/api/adoptions/visits/mine').set(shelterH).expect(200);
    expect(theirs.body.items[0]).toMatchObject({ adoptionId, adopterName: 'Ana' });
    expect((await request(app).get('/api/adoptions/visits/mine').set(strangerH).expect(200)).body.items).toHaveLength(0);
  });

  it('cambiar la fecha vuelve a pedir que la acepten; no hay visita en solicitudes cerradas ni en el pasado', async () => {
    const adoptionId = await apply();
    await request(app).post(`/api/adoptions/${adoptionId}/visit`).set(shelterH).send({ at: inDays(-1) }).expect(400);
    await request(app).post(`/api/adoptions/${adoptionId}/visit`).set(shelterH).send({ at: inDays(2) }).expect(200);
    await request(app).post(`/api/adoptions/${adoptionId}/visit/accept`).set(adopterH).expect(200);
    const again = await request(app).post(`/api/adoptions/${adoptionId}/visit`).set(shelterH).send({ at: inDays(4) }).expect(200);
    expect(again.body.visit.status).toBe('propuesta');
    expect(again.body.status).toBe('cita_propuesta');

    await request(app).patch(`/api/adoptions/${adoptionId}/status`).set(shelterH).send({ status: 'rechazada' }).expect(200);
    await request(app).post(`/api/adoptions/${adoptionId}/visit`).set(shelterH).send({ at: inDays(5) }).expect(409);
    // Otra protectora no puede proponer visitas de animales ajenos.
    await request(app).post(`/api/adoptions/${adoptionId}/visit`).set(H(id(), 'landlord')).send({ at: inDays(5) }).expect(403);
  });
});

describe('Mensajes: cita con el veterinario', () => {
  it('la cita abre la conversación y sus cambios salen como tarjetas', async () => {
    const appt = await request(app).post('/api/vet-appointments').set(adopterH)
      .send({ vetId, reason: 'Vacuna anual', requestedAt: inDays(2) }).expect(201);

    const [forVet] = await inbox(vetH);
    expect(forVet.context).toMatchObject({ type: 'vet_appointment', appointmentId: String(appt.body._id), status: 'requested', role: 'vet' });
    expect(forVet.other.name).toBe('Ana');
    expect(forVet.lastMessage.systemCode).toBe('vet.requested');

    await request(app).patch(`/api/vet-appointments/${appt.body._id}/status`).set(vetH).send({ status: 'confirmed' }).expect(200);
    const [forOwner] = await inbox(adopterH);
    expect(forOwner.other.name).toBe('Clínica Sur');
    expect(forOwner.context.status).toBe('confirmed');
    const [card] = await messages(adopterH, forOwner._id);
    expect(card).toMatchObject({ systemCode: 'vet.confirmed', type: 'system' });

    await request(app).post('/api/chat/conversations/ensure').set(strangerH)
      .send({ kind: 'vet_appointment', refId: String(appt.body._id) }).expect(403);
  });
});

describe('Mensajes: no leídos y correo', () => {
  async function conversationWithMessage() {
    await apply();
    const [conv] = await inbox(adopterH);
    await request(app).post(`/api/chat/${conv._id}/messages`).set(adopterH).send({ body: '¿Puedo ir el sábado?' }).expect(201);
    return String(conv._id);
  }
  const later = (min: number) => new Date(Date.now() + min * 60_000);

  it('cuenta no leídos, avisa al móvil con enlace a la conversación y marca «visto»', async () => {
    const convId = await conversationWithMessage();
    expect(sendPushToUser).toHaveBeenCalledWith(shelterId, expect.objectContaining({ title: 'Ana · Luna', url: `/mensajes/${convId}` }));
    expect((await request(app).get('/api/chat/unread-count').set(shelterH).expect(200)).body.total).toBe(2);

    expect((await request(app).get(`/api/chat/${convId}/seen`).set(adopterH).expect(200)).body.seenUntil).toBeNull();
    await request(app).post(`/api/chat/${convId}/read`).set(shelterH).expect(200);
    expect((await request(app).get('/api/chat/unread-count').set(shelterH).expect(200)).body.total).toBe(0);
    expect((await request(app).get(`/api/chat/${convId}/seen`).set(adopterH).expect(200)).body.seenUntil).not.toBeNull();

    // Los mensajes nuevos se piden con `after`.
    const all = await messages(shelterH, convId);
    const fresh = await request(app).get(`/api/chat/${convId}/messages`).query({ after: all[0].createdAt }).set(shelterH).expect(200);
    expect(fresh.body).toHaveLength(0);
    await request(app).post(`/api/chat/${convId}/messages`).set(adopterH).send({ body: '' }).expect(400);
  });

  it('un correo a los 10 minutos, uno solo, y ninguno si ya lo leyó', async () => {
    const convId = await conversationWithMessage();
    await request(app).post(`/api/chat/${convId}/messages`).set(adopterH).send({ body: 'Y otra cosa' }).expect(201);

    expect(await sendUnreadChatEmails(later(5))).toBe(0);
    expect(await sendUnreadChatEmails(later(11))).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith('norte@test.com', 'Ana te ha escrito sobre Luna', expect.stringContaining('Y otra cosa'), expect.any(String));
    expect(await sendUnreadChatEmails(later(30))).toBe(0);

    // Tras leer, el siguiente mensaje vuelve a poder avisar; si lo lee a tiempo, no.
    await request(app).post(`/api/chat/${convId}/read`).set(shelterH).expect(200);
    await request(app).post(`/api/chat/${convId}/messages`).set(adopterH).send({ body: 'Hola de nuevo' }).expect(201);
    await request(app).post(`/api/chat/${convId}/read`).set(shelterH).expect(200);
    expect(await sendUnreadChatEmails(later(15))).toBe(0);
  });

  it('respeta quien desactiva el correo en Ajustes', async () => {
    await request(app).put('/api/chat/prefs').set(shelterH).send({ emailUnread: false }).expect(200);
    expect((await request(app).get('/api/chat/prefs').set(shelterH).expect(200)).body.emailUnread).toBe(false);
    await conversationWithMessage();
    expect(await sendUnreadChatEmails(later(11))).toBe(0);
    expect(sendEmail).not.toHaveBeenCalledWith('norte@test.com', expect.anything(), expect.anything(), expect.anything());
    const conv = await Conversation.findOne({}).lean();
    expect(conv.pendingEmail[0].emailed).toBe(true);
  });
});
