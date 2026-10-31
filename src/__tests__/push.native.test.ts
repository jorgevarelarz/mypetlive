import request from 'supertest';
import mongoose from 'mongoose';
import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

// APNs simulado: cada petición responde con el status que toque en `nextStatus`.
const sent: Array<{ headers: any; body: any }> = [];
let nextStatus: Array<{ status: number; reason?: string }> = [];
jest.mock('http2', () => ({
  ...jest.requireActual('http2'),
  connect: () => {
    const client: any = new EventEmitter();
    client.close = () => undefined;
    client.request = (headers: any) => {
      const req: any = new EventEmitter();
      req.end = (body: string) => {
        sent.push({ headers, body: JSON.parse(body) });
        const r = nextStatus.shift() || { status: 200 };
        setImmediate(() => {
          req.emit('response', { ':status': r.status });
          if (r.reason) req.emit('data', JSON.stringify({ reason: r.reason }));
          req.emit('end');
        });
      };
      return req;
    };
    return client;
  },
}));

let app: any;
let mongo: MongoMemoryServer | undefined;
let NativePushToken: any;
let sendPushToUser: any;

const TOKEN = 'a'.repeat(64);
const userId = new mongoose.Types.ObjectId().toHexString();
const otherId = new mongoose.Types.ObjectId().toHexString();
const H = (id: string) => ({ 'x-user-id': id, 'x-user-role': 'tenant', 'x-user-verified': 'true' });

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'apns-'));
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  writeFileSync(path.join(dir, 'k.p8'), privateKey.export({ type: 'pkcs8', format: 'pem' }));
  process.env.APNS_KEY_ID = 'TESTKEY123';
  process.env.APNS_TEAM_ID = 'TEAM123456';
  process.env.APNS_KEY_PATH = path.join(dir, 'k.p8');
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  NativePushToken = (await import('../models/nativePushToken.model')).NativePushToken;
  sendPushToUser = (await import('../utils/push')).sendPushToUser;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await NativePushToken.deleteMany({});
  sent.length = 0;
  nextStatus = [];
});

describe('Notificaciones de la app nativa (APNs)', () => {
  it('registra el token del iPhone y lo reasigna si entra otra cuenta en el mismo móvil', async () => {
    await request(app).post('/api/push/native').set(H(userId)).send({ token: TOKEN, platform: 'ios' }).expect(201);
    await request(app).post('/api/push/native').set(H(otherId)).send({ token: TOKEN, platform: 'ios' }).expect(201);
    const docs = await NativePushToken.find({}).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].userId).toBe(otherId);
  });

  // Sin token el middleware de test mete un usuario por defecto: la exigencia de
  // sesión de /api/push no se puede probar aquí (app.use('/api/push', authenticate)).
  it('rechaza tokens con formato raro', async () => {
    await request(app).post('/api/push/native').set(H(userId)).send({ token: 'hola', platform: 'ios' }).expect(400);
  });

  it('cerrar sesión borra solo el token propio', async () => {
    await NativePushToken.create({ userId, token: TOKEN, platform: 'ios' });
    await request(app).delete('/api/push/native').set(H(otherId)).send({ token: TOKEN }).expect(200);
    expect(await NativePushToken.countDocuments()).toBe(1);
    await request(app).delete('/api/push/native').set(H(userId)).send({ token: TOKEN }).expect(200);
    expect(await NativePushToken.countDocuments()).toBe(0);
  });

  it('sendPushToUser avisa al iPhone con el bundle de MyPetLive y la pantalla a abrir', async () => {
    await NativePushToken.create({ userId, token: TOKEN, platform: 'ios' });
    await sendPushToUser(userId, { title: 'Nuevo mensaje', body: 'Hola', url: '/adoptions/1' });
    expect(sent).toHaveLength(1);
    expect(sent[0].headers[':path']).toBe(`/3/device/${TOKEN}`);
    expect(sent[0].headers['apns-topic']).toBe('es.mypetlive.app');
    expect(sent[0].headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sent[0].body).toEqual({ aps: { alert: { title: 'Nuevo mensaje', body: 'Hola' }, sound: 'default' }, url: '/adoptions/1' });
  });

  it('un token que Apple da por muerto (410) se borra', async () => {
    await NativePushToken.create({ userId, token: TOKEN, platform: 'ios' });
    nextStatus = [{ status: 410, reason: 'Unregistered' }];
    await sendPushToUser(userId, { title: 'x' });
    expect(await NativePushToken.countDocuments()).toBe(0);
  });
});
