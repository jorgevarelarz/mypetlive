import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { ageFromBirthDate, parseBirthDate } from '../utils/age';

/**
 * Fecha de nacimiento de la mascota (21-10-2026): el formulario pide el
 * cumpleaños y la edad se calcula de él en vez de escribirse a mano.
 */
describe('ageFromBirthDate', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  it('meses y años', () => {
    expect(ageFromBirthDate('2026-10-10', now)).toBe('Menos de 1 mes');
    expect(ageFromBirthDate('2026-09-21', now)).toBe('1 mes');
    expect(ageFromBirthDate('2026-02-01', now)).toBe('8 meses');
    expect(ageFromBirthDate('2025-10-21', now)).toBe('1 año');
    expect(ageFromBirthDate('2025-10-22', now)).toBe('11 meses');
    expect(ageFromBirthDate('2019-03-05', now)).toBe('7 años');
  });
  it('rechaza fechas imposibles o futuras', () => {
    expect(parseBirthDate('2026-02-30')).toBeNull();
    expect(parseBirthDate('2999-01-01')).toBeNull();
    expect(parseBirthDate('ayer')).toBeNull();
    expect(parseBirthDate('2020-05-04')).not.toBeNull();
  });
});

let app: any;
let mongo: MongoMemoryServer | undefined;
const headers = { 'x-user-id': new mongoose.Types.ObjectId().toHexString(), 'x-user-role': 'tenant' };

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  const mod = await import('../app');
  app = mod.app || mod.default;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

describe('Alta de mascota con fecha de nacimiento', () => {
  it('guarda la fecha y calcula la edad', async () => {
    const res = await request(app).post('/api/animals/personal').set(headers)
      .send({ name: 'Luna', species: 'cat', birthDate: '2024-01-15' }).expect(201);
    expect(res.body.birthDate).toMatch(/^2024-01-15/);
    expect(res.body.age).toMatch(/años$/);
  });

  it('sin fecha sigue aceptando la edad en texto (apps viejas)', async () => {
    const res = await request(app).post('/api/animals/personal').set(headers)
      .send({ name: 'Max', species: 'dog', age: '3 años' }).expect(201);
    expect(res.body.age).toBe('3 años');
  });

  it('una fecha no válida da invalid_birth_date', async () => {
    const res = await request(app).post('/api/animals/personal').set(headers)
      .send({ name: 'Toby', species: 'dog', birthDate: '2999-01-01' }).expect(400);
    expect(res.body.error).toBe('invalid_birth_date');
  });
});
