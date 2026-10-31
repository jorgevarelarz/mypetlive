import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let Donation: any;

jest.mock('../utils/stripe', () => {
  const stripeMock = {
    accounts: {
      retrieve: jest.fn().mockResolvedValue({ charges_enabled: true }),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.test/cs_test_1' }),
      },
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
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const donorId = new mongoose.Types.ObjectId().toHexString();
const shelterA = new mongoose.Types.ObjectId().toHexString();
const shelterB = new mongoose.Types.ObjectId().toHexString();
const donorH = { 'x-user-id': donorId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
let animalOfA: string;

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  __stripeMock.checkout.sessions.create.mockClear();
  await User.create([
    { _id: donorId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: shelterA, name: 'Protectora A', email: 'a@test.com', passwordHash: 'x', role: 'landlord' },
    { _id: shelterB, name: 'Protectora B', email: 'b@test.com', passwordHash: 'x', role: 'landlord' },
  ]);
  const animal = await Animal.create({
    shelter: shelterA,
    name: 'Pipo',
    species: 'dog',
    age: '1 año',
    size: 'medium',
    createdByRole: 'protectora',
    isPersonalPet: false,
  });
  animalOfA = animal.id;
});

describe('La donación va a la protectora del animal', () => {
  it('un animalId de otra protectora da 400', async () => {
    const res = await request(app)
      .post('/api/donations/checkout-session')
      .set(donorH)
      .send({ amountEUR: 25, animalId: animalOfA, shelterId: shelterB });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'animal_shelter_mismatch' });
    expect(__stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    expect(await Donation.countDocuments()).toBe(0);
  });

  it('un animalId de la misma protectora no da animal_shelter_mismatch', async () => {
    const res = await request(app)
      .post('/api/donations/checkout-session')
      .set(donorH)
      .send({ amountEUR: 25, animalId: animalOfA, shelterId: shelterA });
    expect(res.body.error).not.toBe('animal_shelter_mismatch');
    // Sin Verification, el siguiente filtro es el de protectora verificada.
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('shelter_verification_required');
  });
});
