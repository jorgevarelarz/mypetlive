import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { geolocalizar, distanciaKm, normalizarLugar } from '../utils/geo';

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

const shelterId = new mongoose.Types.ObjectId().toHexString();
const shelterHeaders = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };

async function publicar(name: string, city: string) {
  const created = await request(app)
    .post('/api/animals')
    .set(shelterHeaders)
    .send({ shelter: shelterId, name, species: 'perro', sex: 'female', age: '1 año', ageGroup: 'young', city, size: 'medium' })
    .expect(201);
  await request(app).patch(`/api/animals/${created.body._id}/status`).set(shelterHeaders).send({ status: 'publicado' }).expect(200);
  return created.body;
}

describe('geolocalizar', () => {
  it('reconoce códigos postales, municipios con y sin artículo y formas bilingües', () => {
    expect(normalizarLugar('A Coruña')).toBe(normalizarLugar('La Coruña'));
    expect(normalizarLugar('Coruña, A')).toBe(normalizarLugar('A Coruña'));
    const coruna = geolocalizar('A Coruña')!;
    expect(coruna.lat).toBeCloseTo(43.36, 1);
    expect(coruna.lng).toBeCloseTo(-8.4, 1);
    expect(geolocalizar('15172')!.etiqueta).toBe('15172');
    expect(geolocalizar('Perillo, Oleiros')).not.toBeNull();
    expect(geolocalizar('Oleiros (A Coruña)')).not.toBeNull();
    const ss = geolocalizar('San Sebastián')!;
    expect(distanciaKm(ss, geolocalizar('Donostia')!)).toBeLessThan(5);
    expect(geolocalizar('Palma')!.etiqueta).toMatch(/Mallorca/);
    expect(geolocalizar('Villa Inventada del Sur')).toBeNull();
  });
});

describe('Búsqueda por cercanía', () => {
  it('ordena por distancia desde un código postal y deja al final los sitios desconocidos', async () => {
    await publicar('Madrileña', 'Madrid');
    await publicar('Sin sitio', 'Villa Inventada del Sur');
    await publicar('Lucense', 'Lugo');
    await publicar('Coruñesa', 'A Coruña');
    await publicar('Oleirense', 'Oleiros');

    const res = await request(app).get('/api/animals').query({ sort: 'distance', near: '15172' }).expect(200);
    expect(res.body.items.map((a: any) => a.name)).toEqual(['Oleirense', 'Coruñesa', 'Lucense', 'Madrileña', 'Sin sitio']);
    expect(res.body.origen).toEqual({ etiqueta: '15172', fuente: 'texto' });
    expect(res.body.total).toBe(5);
    const km = res.body.items.map((a: any) => a.distanceKm);
    expect(km[0]).toBeLessThan(10);
    expect(km[3]).toBeGreaterThan(400);
    expect(km[4]).toBeNull();

    const pagina2 = await request(app).get('/api/animals').query({ sort: 'distance', near: '15172', limit: 2, page: 2 }).expect(200);
    expect(pagina2.body.items.map((a: any) => a.name)).toEqual(['Lucense', 'Madrileña']);
  });

  it('si el animal no tiene ciudad reconocible usa el código postal de la protectora', async () => {
    const { User } = await import('../models/user.model');
    await User.create({ _id: shelterId, name: 'Protectora', email: 'p@example.com', passwordHash: 'x', role: 'landlord', profile: { address: { city: 'Lugo', postalCode: '27001' } } } as any);
    await publicar('Sin ciudad', 'Aldea Inventada');
    await publicar('Madrileña', 'Madrid');
    const res = await request(app).get('/api/animals').query({ sort: 'distance', near: 'Lugo' }).expect(200);
    expect(res.body.items.map((a: any) => a.name)).toEqual(['Sin ciudad', 'Madrileña']);
    expect(res.body.items[0].distanceKm).toBeLessThan(5);
  });

  it('acepta coordenadas del navegador y las redondea', async () => {
    await publicar('Madrileña', 'Madrid');
    await publicar('Coruñesa', 'A Coruña');
    const res = await request(app).get('/api/animals').query({ sort: 'distance', lat: '40.4167', lng: '-3.7033' }).expect(200);
    expect(res.body.items[0].name).toBe('Madrileña');
    expect(res.body.origen.fuente).toBe('ubicacion');
  });

  it('sin ubicación conocida mantiene el orden normal y devuelve origen null', async () => {
    await publicar('Primera', 'Madrid');
    await publicar('Segunda', 'Lugo');
    const res = await request(app).get('/api/animals').query({ sort: 'distance' }).expect(200);
    expect(res.body.origen).toBeNull();
    expect(res.body.items.map((a: any) => a.name)).toEqual(['Segunda', 'Primera']);
  });

  it('usa la dirección del perfil si ha iniciado sesión', async () => {
    const { User } = await import('../models/user.model');
    const yo: any = await User.create({ name: 'Ana', email: 'ana@example.com', passwordHash: 'x', role: 'tenant', profile: { address: { city: 'Madrid', postalCode: '28013' } } } as any);
    await publicar('Coruñesa', 'A Coruña');
    await publicar('Madrileña', 'Madrid');
    const res = await request(app)
      .get('/api/animals')
      .set({ 'x-user-id': String(yo._id), 'x-user-role': 'tenant', 'x-user-verified': 'true' })
      .query({ sort: 'distance' })
      .expect(200);
    expect(res.body.origen.fuente).toBe('perfil');
    expect(res.body.items[0].name).toBe('Madrileña');
  });
});
