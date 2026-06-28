import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

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

const vetId = new mongoose.Types.ObjectId().toHexString();
const vetH = { 'x-user-id': vetId, 'x-user-role': 'vet', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create({ _id: vetId, name: 'Clínica Norte', email: 'vet@test.com', passwordHash: 'x', role: 'vet' });
});

describe('Perfil de veterinario', () => {
  it('persiste la ficha profesional del vet (colegiado, especialidades, servicios)', async () => {
    const res = await request(app)
      .patch(`/api/users/${vetId}`)
      .set(vetH)
      .send({
        profile: {
          orgName: 'Clínica Norte',
          vet: {
            licenseNumber: 'COLVET-12345',
            specialties: ['Felina', 'Cirugía'],
            services: ['Vacunación', 'Urgencias'],
            schedule: 'L-V 9:00-20:00',
            emergency24h: true,
          },
        },
      })
      .expect(200);

    expect(res.body.profile.vet.licenseNumber).toBe('COLVET-12345');
    expect(res.body.profile.vet.specialties).toEqual(['Felina', 'Cirugía']);
    expect(res.body.profile.vet.services).toEqual(['Vacunación', 'Urgencias']);
    expect(res.body.profile.vet.emergency24h).toBe(true);

    const fromDb: any = await User.findById(vetId).lean();
    expect(fromDb.profile.vet.schedule).toBe('L-V 9:00-20:00');
  });

  it('ignora campos no permitidos y limpia arrays vacíos', async () => {
    const res = await request(app)
      .patch(`/api/users/${vetId}`)
      .set(vetH)
      .send({ profile: { vet: { licenseNumber: '  AB-1  ', specialties: ['', '  ', 'Canina'], hacker: 'x' } } })
      .expect(200);
    expect(res.body.profile.vet.licenseNumber).toBe('AB-1');
    expect(res.body.profile.vet.specialties).toEqual(['Canina']);
    expect(res.body.profile.vet.hacker).toBeUndefined();
  });
});
