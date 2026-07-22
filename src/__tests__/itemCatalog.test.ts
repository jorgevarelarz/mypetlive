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

const storeId = new mongoose.Types.ObjectId().toHexString();
const storeH = { 'x-user-id': storeId, 'x-user-role': 'store', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create({ _id: storeId, name: 'Tienda Norte', email: 'store@test.com', passwordHash: 'x', role: 'store' });
});

describe('Catálogo de productos del partner (itemCatalog)', () => {
  it('sanea nombre/precio, filtra entradas inválidas y cae en el límite de 60', async () => {
    const res = await request(app)
      .patch(`/api/users/${storeId}`)
      .set(storeH)
      .send({
        profile: {
          itemCatalog: [
            { name: '  Pienso cachorro 3kg  ', priceEur: 32.505 },
            { name: 'Arena aglomerante' }, // sin precio: válido
            { name: '', priceEur: 5 }, // sin nombre → fuera
            { name: 'Negativo', priceEur: -1 }, // precio inválido → precio fuera, nombre queda
            'no-un-objeto',
          ],
        },
      })
      .expect(200);

    expect(res.body.profile.itemCatalog).toEqual([
      { name: 'Pienso cachorro 3kg', priceEur: 32.51 },
      { name: 'Arena aglomerante' },
      { name: 'Negativo' },
    ]);
  });

  it('persiste y se puede leer de nuevo tras actualizar otro campo del perfil', async () => {
    await request(app)
      .patch(`/api/users/${storeId}`)
      .set(storeH)
      .send({ profile: { itemCatalog: [{ name: 'Collar', priceEur: 8 }] } })
      .expect(200);

    const res = await request(app)
      .patch(`/api/users/${storeId}`)
      .set(storeH)
      .send({ profile: { bio: 'Tienda de barrio' } })
      .expect(200);

    expect(res.body.profile.itemCatalog).toEqual([{ name: 'Collar', priceEur: 8 }]);
    expect(res.body.profile.bio).toBe('Tienda de barrio');
  });
});
