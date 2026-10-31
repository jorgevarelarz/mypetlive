import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let Donation: any;
let PatitaLog: any;

jest.mock('../utils/stripe', () => {
  const stripeMock = {
    webhooks: {
      constructEvent: jest.fn(),
    },
  };
  return {
    getStripeClient: jest.fn(() => stripeMock),
    isStripeConfigured: jest.fn(() => true),
    __resetStripeClientForTests: jest.fn(),
    __stripeMock: stripeMock,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __stripeMock } = require('../utils/stripe');

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
  Donation = (await import('../models/donation.model')).Donation;
  PatitaLog = (await import('../models/patitaLog.model')).PatitaLog;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

let evtSeq = 0;
function sendEvent(type: string, object: any) {
  evtSeq += 1;
  const event = { id: `evt_refund_${evtSeq}`, type, data: { object } };
  __stripeMock.webhooks.constructEvent.mockImplementationOnce(() => event);
  return request(app)
    .post('/api/stripe/webhook')
    .set('Stripe-Signature', 't=1,v1=fake')
    .set('Content-Type', 'application/json')
    .send(Buffer.from(JSON.stringify({ any: 'payload' })));
}

const donorId = new mongoose.Types.ObjectId().toHexString();
let shelterId: string;
let animalId: string;

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create({ _id: donorId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' });
  const shelter = await User.create({
    name: 'Protectora Sur',
    email: 'shelter@test.com',
    passwordHash: 'x',
    role: 'landlord',
    patitas: 0,
  });
  shelterId = shelter.id;
  const animal = await Animal.create({
    shelter: shelter._id,
    name: 'Pipo',
    species: 'dog',
    age: '1 año',
    size: 'medium',
    createdByRole: 'protectora',
    isPersonalPet: false,
  });
  animalId = animal.id;
  await Donation.create({
    userId: donorId,
    animalId,
    shelterId,
    amount: 2500,
    currency: 'eur',
    status: 'pending',
    sessionId: 'cs_x',
  });
});

async function completeDonation() {
  const res = await sendEvent('checkout.session.completed', {
    id: 'cs_x',
    amount_total: 2500,
    currency: 'eur',
    payment_intent: 'pi_x',
    metadata: { donation: 'true', userId: donorId, animalId, shelterId },
  });
  expect(res.status).toBe(200);
}

const patitasOf = async (id: string) => (await User.findById(id).lean()).patitas;

describe('Reembolsos y disputas de donaciones', () => {
  it('una donación completada y luego reembolsada deja la Donation refunded y las Patitas de la protectora como estaban', async () => {
    await completeDonation();
    const done = await Donation.findOne({ sessionId: 'cs_x' }).lean();
    expect(done.status).toBe('completed');
    expect(done.paymentRef).toBe('pi_x');
    expect(done.patitasGranted).toBe(25);
    expect(done.patitasShelterId).toBe(shelterId);
    expect(await patitasOf(shelterId)).toBe(25);

    const res = await sendEvent('charge.refunded', { id: 'ch_x', refunded: true, payment_intent: 'pi_x' });
    expect(res.status).toBe(200);

    const refunded = await Donation.findOne({ sessionId: 'cs_x' }).lean();
    expect(refunded.status).toBe('refunded');
    expect(await patitasOf(shelterId)).toBe(0);
    const log = await PatitaLog.findOne({ shelterId, amount: { $lt: 0 } }).lean();
    expect(log).toBeTruthy();
    expect(log.source).toBe('donation');
    expect(log.amount).toBe(-25);
    expect(log.concept).toBe('Donación reembolsada');
    expect(String(log.userId)).toBe(donorId);
    expect(String(log.animalId)).toBe(animalId);
  });

  it('una disputa también retira las Patitas', async () => {
    await completeDonation();
    const res = await sendEvent('charge.dispute.created', { id: 'dp_x', payment_intent: 'pi_x' });
    expect(res.status).toBe(200);
    const d = await Donation.findOne({ sessionId: 'cs_x' }).lean();
    expect(d.status).toBe('disputed');
    expect(await patitasOf(shelterId)).toBe(0);
    const log = await PatitaLog.findOne({ shelterId, amount: { $lt: 0 } }).lean();
    expect(log.amount).toBe(-25);
    expect(log.concept).toBe('Donación disputada');
  });

  it('el saldo nunca baja de 0', async () => {
    await completeDonation();
    await User.updateOne({ _id: shelterId }, { $set: { patitas: 10 } });
    await sendEvent('charge.refunded', { id: 'ch_x', refunded: true, payment_intent: 'pi_x' }).expect(200);
    expect(await patitasOf(shelterId)).toBe(0);
    const logs = await PatitaLog.find({ shelterId, amount: { $lt: 0 } }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0].amount).toBe(-10);
  });

  it('reembolso y disputa del mismo pago solo descuentan una vez', async () => {
    await completeDonation();
    await User.updateOne({ _id: shelterId }, { $inc: { patitas: 30 } }); // 55
    await sendEvent('charge.refunded', { id: 'ch_x', refunded: true, payment_intent: { id: 'pi_x' } }).expect(200);
    expect(await patitasOf(shelterId)).toBe(30);
    await sendEvent('charge.dispute.created', { id: 'dp_x', payment_intent: 'pi_x' }).expect(200);
    expect(await patitasOf(shelterId)).toBe(30);
    expect((await Donation.findOne({ sessionId: 'cs_x' }).lean()).status).toBe('refunded');
    expect(await PatitaLog.countDocuments({ shelterId, amount: { $lt: 0 } })).toBe(1);
  });

  it('reembolso parcial o pago ajeno no tocan nada', async () => {
    await completeDonation();
    await sendEvent('charge.refunded', { id: 'ch_x', refunded: false, payment_intent: 'pi_x' }).expect(200);
    await sendEvent('charge.refunded', { id: 'ch_y', refunded: true, payment_intent: 'pi_otro' }).expect(200);
    await sendEvent('charge.dispute.created', { id: 'dp_y', payment_intent: 'pi_otro' }).expect(200);
    expect((await Donation.findOne({ sessionId: 'cs_x' }).lean()).status).toBe('completed');
    expect(await patitasOf(shelterId)).toBe(25);
    expect(await PatitaLog.countDocuments({ amount: { $lt: 0 } })).toBe(0);
  });

  it('una donación de antes del cambio (sin patitasGranted) se revierte con el cálculo por importe', async () => {
    await Donation.updateOne(
      { sessionId: 'cs_x' },
      { $set: { status: 'completed', paymentRef: 'pi_old' } },
    );
    await User.updateOne({ _id: shelterId }, { $set: { patitas: 25 } });
    await sendEvent('charge.refunded', { id: 'ch_old', refunded: true, payment_intent: 'pi_old' }).expect(200);
    expect(await patitasOf(shelterId)).toBe(0);
    expect((await Donation.findOne({ sessionId: 'cs_x' }).lean()).status).toBe('refunded');
  });
});
