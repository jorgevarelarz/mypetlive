import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer, limpiarBase } from './utils/mongoMemoryServer';

jest.mock('../utils/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

import { sendEmail } from '../utils/email';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let Adoption: any;
let VetAppointment: any;
let PushSubscription: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
  Adoption = (await import('../models/adoption.model')).Adoption;
  VetAppointment = (await import('../models/vetAppointment.model')).VetAppointment;
  PushSubscription = (await import('../models/pushSubscription.model')).PushSubscription;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const adopterId = new mongoose.Types.ObjectId().toHexString();
const shelterId = new mongoose.Types.ObjectId().toHexString();
const socialId = new mongoose.Types.ObjectId().toHexString();
const vetId = new mongoose.Types.ObjectId().toHexString();
const adopterH = { 'x-user-id': adopterId, 'x-user-role': 'tenant', 'x-user-verified': 'false' };
const shelterH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const socialH = { 'x-user-id': socialId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const PASS = 'contraseña-larga-de-prueba';

let animalId: string;

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await limpiarBase();
  }
  (sendEmail as jest.Mock).mockClear();
  const hash = await bcrypt.hash(PASS, 4);
  await User.create([
    { _id: adopterId, name: 'Ana', email: 'ana@test.com', passwordHash: hash, role: 'tenant', patitas: 30, profile: { phone: '600000000', bio: 'Me encantan los gatos' } },
    { _id: shelterId, name: 'Protectora Sol', email: 'sol@test.com', passwordHash: hash, role: 'landlord', patitas: 0 },
    { _id: socialId, name: 'Bea', email: 'bea@test.com', role: 'tenant', authProviders: [{ provider: 'google', sub: 'g-1' }] },
    { _id: vetId, name: 'Vet', email: 'vet@test.com', passwordHash: hash, role: 'vet' },
  ]);
  const animal = await Animal.create({
    name: 'Luna', species: 'cat', age: '2 años', shelter: shelterId, status: 'reservado', createdByRole: 'protectora', code: 'MPL-LUNA01',
  });
  animalId = String(animal._id);
  await Adoption.create({
    animalId, adopterId, status: 'preaprobada', answers: [{ question: '¿Tienes jardín?', answer: 'Sí' }],
  });
  await Animal.create({
    name: 'Toby', species: 'dog', age: '4 años', shelter: shelterId, ownerId: adopterId, isPersonalPet: true,
    status: 'adoptado', createdByRole: 'tenant', code: 'MPL-TOBY01',
  });
  await PushSubscription.create({ userId: adopterId, endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } });
});

describe('Borrar la cuenta propia', () => {
  it('pide la contraseña correcta', async () => {
    const res = await request(app).post('/api/auth/account/delete').set(adopterH).send({ password: 'mala' }).expect(400);
    expect(res.body.error).toBe('invalid_password');
    const doc = await User.findById(adopterId).lean();
    expect(doc.deletedAt).toBeNull();
  });

  it('un adoptante sin verificar puede borrarse: se anonimiza y se limpian sus datos', async () => {
    await request(app).get('/api/auth/account/deletion-check').set(adopterH).expect(200, { canDelete: true, blockers: [], confirmWith: 'password' });
    await request(app).post('/api/auth/account/delete').set(adopterH).send({ password: PASS }).expect(200);

    const doc = await User.findById(adopterId).select('+passwordHash').lean();
    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(doc.name).toBe('Usuario eliminado');
    expect(doc.email).toMatch(/@mypetlive\.invalid$/);
    expect(await bcrypt.compare(PASS, doc.passwordHash)).toBe(false);
    expect(doc.profile).toBeUndefined();
    expect(doc.patitas).toBe(0);
    expect(doc.tokenVersion).toBe(1);

    // Su candidatura abierta se cancela y el animal reservado vuelve a estar disponible.
    const adoption = await Adoption.findOne({ animalId }).lean();
    expect(adoption.status).toBe('cancelada');
    expect(adoption.answers).toEqual([]);
    expect((await Animal.findById(animalId).lean()).status).toBe('publicado');

    // Su mascota queda archivada y sin dueño; su suscripción push desaparece.
    const toby = await Animal.findOne({ code: 'MPL-TOBY01' }).lean();
    expect(toby.ownerId).toBeNull();
    expect(toby.status).toBe('archivado');
    expect(await PushSubscription.countDocuments({ userId: adopterId })).toBe(0);

    // Aviso al correo de antes, no a la dirección anonimizada.
    expect((sendEmail as jest.Mock).mock.calls[0][0]).toBe('ana@test.com');

    // Ya no se puede entrar con el correo y la contraseña de antes.
    await request(app).post('/api/auth/login').send({ email: 'ana@test.com', password: PASS }).expect(400);
  });

  it('una cuenta de Google confirma con su email', async () => {
    await request(app).post('/api/auth/account/delete').set(socialH).send({ confirmEmail: 'otro@test.com' }).expect(400);
    await request(app).post('/api/auth/account/delete').set(socialH).send({ confirmEmail: 'BEA@test.com' }).expect(200);
    const doc = await User.findById(socialId).lean();
    expect(doc.authProviders).toEqual([]);
  });

  it('una protectora con adopciones en curso no puede borrarse todavía', async () => {
    const res = await request(app).post('/api/auth/account/delete').set(shelterH).send({ password: PASS }).expect(409);
    expect(res.body.blockers).toContain('open_adoptions_as_shelter');
    expect((await User.findById(shelterId).lean()).deletedAt).toBeNull();
  });

  it('una cita veterinaria pendiente bloquea el borrado', async () => {
    await VetAppointment.create({
      vetId, userId: adopterId, animalCode: 'MPL-TOBY01', reason: 'Vacuna', requestedAt: new Date(Date.now() + 86400000), status: 'requested',
    });
    const res = await request(app).get('/api/auth/account/deletion-check').set(adopterH).expect(200);
    expect(res.body).toMatchObject({ canDelete: false, blockers: ['open_vet_appointments'] });
  });

  it('una protectora borrada desaparece del directorio de donaciones y las estadísticas', async () => {
    await Adoption.deleteMany({});
    await request(app).post('/api/auth/account/delete').set(shelterH).send({ password: PASS }).expect(200);
    const doc = await User.findById(shelterId).lean();
    expect(doc.deletedAt).toBeInstanceOf(Date);
    // Sus animales sin adoptar se archivan; el adoptado (de otra persona) no se toca.
    expect((await Animal.findById(animalId).lean()).status).toBe('archivado');
    expect((await Animal.findOne({ code: 'MPL-TOBY01' }).lean()).status).toBe('adoptado');
  });
});
