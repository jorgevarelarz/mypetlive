import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { User } from '../models/user.model';

let app: any;
let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  const mod = await import('../app');
  app = mod.app || mod.default;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
});

const signToken = (userId: string, role: string) => {
  return jwt.sign({ id: userId, role }, 'insecure', { expiresIn: '1h' });
};

describe('Personal pets API', () => {
  it('allows a tenant to create and list personal pets', async () => {
    const tenant = await User.create({
      name: 'Adoptante Test',
      email: 'tenant@example.com',
      passwordHash: 'hash',
      role: 'tenant',
    });

    const token = signToken(tenant.id, 'tenant');

    const created = await request(app)
      .post('/api/animals/personal')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Milo', species: 'cat', age: '2 años' })
      .expect(201);

    expect(created.body.isPersonalPet).toBe(true);
    expect(String(created.body.ownerId)).toBe(String(tenant.id));

    const mine = await request(app)
      .get('/api/animals/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(mine.body.items)).toBe(true);
    expect(mine.body.items.length).toBe(1);
    expect(mine.body.items[0].animal.name).toBe('Milo');
    expect(mine.body.items[0].animal.isPersonalPet).toBe(true);
  });
});
