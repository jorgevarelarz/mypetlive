import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

// Aviso de "se acaba el pienso" y bloque "dónde comprarlo".
//
// El aviso se mide en DÍAS y no en raciones: avisar cuando quedan dos comidas no
// da tiempo a comprar nada, que es lo único que se pretende con el correo.

let app: any;
let mongo: MongoMemoryServer | undefined;
let Animal: any;
let User: any;
let ShopClick: any;
let sendSupplyAlerts: any;

// El prefijo `mock` es lo que deja a jest referenciarla desde la factoría.
const mockSent: Array<{ to: string; subject: string; body: string }> = [];
jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn(async (to: string, subject: string, body: string) => {
    mockSent.push({ to, subject, body });
  }),
}));
const sent = mockSent;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  process.env.FRONTEND_URL = 'https://mypetlive.es';
  const mod = await import('../app');
  app = mod.app || mod.default;
  Animal = (await import('../models/animal.model')).Animal;
  User = (await import('../models/user.model')).User;
  ShopClick = (await import('../models/shopClick.model')).ShopClick;
  sendSupplyAlerts = (await import('../jobs/supplyAlerts')).sendSupplyAlerts;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const ownerId = new mongoose.Types.ObjectId().toHexString();
const storeId = new mongoose.Types.ObjectId().toHexString();
const ownerH = { 'x-user-id': ownerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  sent.length = 0;
  await User.create([
    { _id: ownerId, name: 'Ana', email: 'ana@alerts.test', passwordHash: 'x', role: 'tenant' },
    {
      _id: storeId,
      name: 'Tienda Central',
      email: 'tienda@alerts.test',
      passwordHash: 'x',
      role: 'store',
      profile: {
        address: { city: 'A Coruña' },
        itemCatalog: [
          { name: 'Acana Adult 6kg', priceEur: 54.9 },
          { name: 'Arena aglomerante 10L', priceEur: 8.5 },
        ],
      },
    },
  ]);
});

async function petWithFood(remaining: number, perUse = 100) {
  return Animal.create({
    shelter: ownerId,
    ownerId,
    name: 'Michi',
    species: 'gato',
    age: '3 años',
    isPersonalPet: true,
    createdByRole: 'tenant',
    carePantry: {
      foods: [{ name: 'Acana Adult', unit: 'kg', packSize: 6000, perUse, remaining }],
      litters: [],
    },
  });
}

describe('aviso de existencias bajas', () => {
  it('avisa cuando quedan pocos días y no repite en la siguiente pasada', async () => {
    const pet = await petWithFood(300); // 3 raciones

    expect(await sendSupplyAlerts()).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ana@alerts.test');
    expect(sent[0].subject).toContain('poca comida');

    // Segunda pasada del cron: silencio.
    expect(await sendSupplyAlerts()).toBe(0);
    expect(sent).toHaveLength(1);

    const saved = await Animal.findById(pet._id).lean();
    expect(saved.carePantry.foods[0].lowNotifiedAt).toBeTruthy();
  });

  it('no avisa si queda de sobra', async () => {
    await petWithFood(6000); // 60 raciones
    expect(await sendSupplyAlerts()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('no avisa de productos sin ración configurada', async () => {
    await Animal.create({
      shelter: ownerId, ownerId, name: 'Michi', species: 'gato', age: '3 años',
      isPersonalPet: true, createdByRole: 'tenant',
      carePantry: { foods: [{ name: 'Lo que haya' }], litters: [] },
    });

    expect(await sendSupplyAlerts()).toBe(0);
  });

  it('reponer rearma el aviso', async () => {
    const pet = await petWithFood(300);
    await sendSupplyAlerts();
    expect(sent).toHaveLength(1);

    await request(app)
      .put(`/api/animals/${pet._id}/care/supplies`)
      .set(ownerH)
      .send({ kind: 'food', name: 'Acana Adult', refill: true })
      .expect(200);

    const refilled = await Animal.findById(pet._id).lean();
    expect(refilled.carePantry.foods[0].lowNotifiedAt).toBeFalsy();

    // Y cuando vuelva a acabarse, vuelve a avisar.
    await Animal.updateOne({ _id: pet._id }, { $set: { 'carePantry.foods.0.remaining': 200 } });
    expect(await sendSupplyAlerts()).toBe(1);
    expect(sent).toHaveLength(2);
  });

  it('el correo lleva dónde comprarlo, con precio y enlace medible', async () => {
    const pet = await petWithFood(200);
    await sendSupplyAlerts();

    const body = sent[0].body;
    expect(body).toContain('Dónde comprarlo');
    expect(body).toContain('Tienda Central');
    expect(body).toContain('54.90 €');
    // El enlace pasa por el redirector que cuenta los clics.
    expect(body).toContain(`/api/shop/click/${storeId}`);
    expect(body).toContain('src=email');
  });
});

describe('dónde comprarlo', () => {
  it('encuentra la tienda por el nombre del producto, aunque no sea exacto', async () => {
    const res = await request(app)
      .get('/api/shop/where-to-buy')
      .query({ product: 'Acana Adult' })
      .set(ownerH)
      .expect(200);

    expect(res.body.options).toHaveLength(1);
    expect(res.body.options[0]).toMatchObject({
      partnerName: 'Tienda Central',
      city: 'A Coruña',
      priceEur: 54.9,
    });
  });

  it('no inventa tiendas para un producto que nadie vende', async () => {
    const res = await request(app)
      .get('/api/shop/where-to-buy')
      .query({ product: 'Pienso inexistente' })
      .set(ownerH)
      .expect(200);

    expect(res.body.options).toHaveLength(0);
  });

  it('el clic se registra y redirige', async () => {
    const res = await request(app)
      .get(`/api/shop/click/${storeId}`)
      .query({ product: 'Acana Adult', src: 'email' })
      .expect(302);

    expect(res.headers.location).toContain('/comprar');
    expect(res.headers.location).toContain('tienda=' + storeId);

    const clicks = await ShopClick.find().lean();
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({ product: 'Acana Adult', source: 'email' });
  });

  it('un partner desconocido no rompe la redirección ni cuenta como clic', async () => {
    await request(app).get('/api/shop/click/no-es-un-id').expect(302);
    expect(await ShopClick.countDocuments()).toBe(0);
  });
});
