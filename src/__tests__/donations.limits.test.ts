import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { DONATION_MIN_EUR, DONATION_MAX_EUR } from '../utils/limits';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  delete process.env.STRIPE_SECRET_KEY; // el tope se comprueba antes de llegar a Stripe
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const donorId = new mongoose.Types.ObjectId().toHexString();
const shelterId = new mongoose.Types.ObjectId().toHexString();
const donorH = { 'x-user-id': donorId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: donorId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: shelterId, name: 'Protectora Sur', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord' },
  ]);
});

const donate = (amountEUR: any) =>
  request(app).post('/api/donations/checkout-session').set(donorH).send({ amountEUR, shelterId });

describe('Topes de importe de la donación', () => {
  it('un dedazo por encima del tope no llega a cobrarse', async () => {
    // 1000 en vez de 100. Antes no había tope de ninguna clase: se cobraba.
    const res = await donate(DONATION_MAX_EUR + 1).expect(400);
    expect(res.body.error).toBe('amount_too_large');
    expect(res.body.max).toBe(DONATION_MAX_EUR);
  });

  it('rechaza importes por debajo del mínimo de Stripe con un motivo legible', async () => {
    const res = await donate(0.2).expect(400);
    expect(res.body.error).toBe('amount_too_small');
    expect(res.body.min).toBe(DONATION_MIN_EUR);
  });

  it('sigue rechazando lo que no es un importe', async () => {
    await donate(0).expect(400);
    await donate(-10).expect(400);
    await donate('mucho').expect(400);
  });

  it('un importe dentro del rango pasa la validación y sigue su camino', async () => {
    // Sin Stripe configurado el siguiente paso es 503, no 400: el importe se
    // aceptó y el rechazo ya es por otra razón.
    await donate(DONATION_MAX_EUR).expect(503);
  });
});
