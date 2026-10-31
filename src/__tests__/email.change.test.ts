import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

import { sendEmail } from '../utils/notification';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const userId = new mongoose.Types.ObjectId().toHexString();
const otherId = new mongoose.Types.ObjectId().toHexString();
const adminId = new mongoose.Types.ObjectId().toHexString();
const userH = { 'x-user-id': userId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const adminH = { 'x-user-id': adminId, 'x-user-role': 'admin', 'x-user-verified': 'true' };

const OLD = 'ana@test.com';
const NEW = 'ana.nueva@test.com';

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  (sendEmail as jest.Mock).mockClear();
  await User.create([
    { _id: userId, name: 'Ana', email: OLD, passwordHash: 'x', role: 'tenant' },
    { _id: otherId, name: 'Luis', email: 'luis@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: adminId, name: 'Admin', email: 'admin@test.com', passwordHash: 'x', role: 'admin' },
  ]);
});

const requestChange = (email: string) =>
  request(app).patch(`/api/users/${userId}`).set(userH).send({ email });

// El token solo existe en la base (select:false): se lee de ahí, como haría
// quien pulsa el enlace del correo.
async function pendingToken() {
  const doc: any = await User.findById(userId).select('+pendingEmailToken +pendingEmail').lean();
  return { token: doc?.pendingEmailToken as string, pendingEmail: doc?.pendingEmail as string };
}

const recipients = () => (sendEmail as jest.Mock).mock.calls.map((c: any[]) => c[0]);

describe('Cambio de email con doble opt-in', () => {
  it('pedir el cambio no toca el email de la cuenta y avisa a las dos direcciones', async () => {
    const res = await requestChange(NEW).expect(200);
    expect(res.body.emailChangePending).toBe(true);

    // Este era el agujero: con una sesión abierta el email cambiaba aquí mismo.
    const doc: any = await User.findById(userId).lean();
    expect(doc.email).toBe(OLD);

    expect(recipients()).toEqual(expect.arrayContaining([NEW, OLD]));
    const { pendingEmail } = await pendingToken();
    expect(pendingEmail).toBe(NEW);
  });

  it('el email no viaja en la respuesta ni el token tampoco', async () => {
    const res = await requestChange(NEW).expect(200);
    expect(res.body.email).toBe(OLD);
    expect(res.body.pendingEmailToken).toBeUndefined();
    expect(res.body.pendingEmail).toBeUndefined();
  });

  it('confirmar con el token aplica el cambio y avisa a la dirección antigua', async () => {
    await requestChange(NEW).expect(200);
    const { token } = await pendingToken();
    (sendEmail as jest.Mock).mockClear();

    const res = await request(app).post('/api/users/email/confirm').send({ token }).expect(200);
    expect(res.body.email).toBe(NEW);

    const doc: any = await User.findById(userId).select('+pendingEmail +pendingEmailToken').lean();
    expect(doc.email).toBe(NEW);
    expect(doc.pendingEmail).toBeUndefined();
    expect(doc.pendingEmailToken).toBeUndefined();

    // La dirección antigua se entera de que ya no da acceso.
    expect(recipients()).toContain(OLD);
  });

  it('un token inválido, gastado o caducado no cambia nada', async () => {
    await request(app).post('/api/users/email/confirm').send({ token: 'inventado' }).expect(400);
    await request(app).post('/api/users/email/confirm').send({}).expect(400);

    await requestChange(NEW).expect(200);
    const { token } = await pendingToken();
    await request(app).post('/api/users/email/confirm').send({ token }).expect(200);
    // Gastado: el segundo intento ya no encuentra nada pendiente.
    await request(app).post('/api/users/email/confirm').send({ token }).expect(400);

    const doc: any = await User.findById(userId).lean();
    expect(doc.email).toBe(NEW);
  });

  it('un token caducado no sirve', async () => {
    await requestChange(NEW).expect(200);
    const { token } = await pendingToken();
    await User.updateOne({ _id: userId }, { $set: { pendingEmailExp: new Date(Date.now() - 1000) } });

    await request(app).post('/api/users/email/confirm').send({ token }).expect(400);
    const doc: any = await User.findById(userId).lean();
    expect(doc.email).toBe(OLD);
  });

  it('no se puede pedir una dirección que ya usa otra cuenta', async () => {
    await request(app).patch(`/api/users/${userId}`).set(userH).send({ email: 'luis@test.com' }).expect(409);
    const doc: any = await User.findById(userId).select('+pendingEmail').lean();
    expect(doc.email).toBe(OLD);
    expect(doc.pendingEmail).toBeUndefined();
  });

  it('si la dirección se ocupa entre la petición y el clic, la confirmación falla', async () => {
    await requestChange('libre@test.com').expect(200);
    const { token } = await pendingToken();
    await User.updateOne({ _id: otherId }, { $set: { email: 'libre@test.com' } });

    await request(app).post('/api/users/email/confirm').send({ token }).expect(409);
    const doc: any = await User.findById(userId).lean();
    expect(doc.email).toBe(OLD);
  });

  it('el resto del perfil se sigue guardando en la misma petición', async () => {
    const res = await request(app).patch(`/api/users/${userId}`).set(userH).send({ name: 'Ana María', email: NEW }).expect(200);
    expect(res.body.name).toBe('Ana María');
    expect(res.body.email).toBe(OLD);
    expect(res.body.emailChangePending).toBe(true);
  });

  it('mandar el mismo email que ya se tiene no dispara nada', async () => {
    const res = await requestChange(OLD).expect(200);
    expect(res.body.emailChangePending).toBeUndefined();
    expect(sendEmail as jest.Mock).not.toHaveBeenCalled();
  });

  it('un admin sí lo cambia a mano (soporte), pero la dirección antigua se entera', async () => {
    const res = await request(app).patch(`/api/users/${userId}`).set(adminH).send({ email: NEW }).expect(200);
    expect(res.body.email).toBe(NEW);
    expect(recipients()).toContain(OLD);
  });
});
