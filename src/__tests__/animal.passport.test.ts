import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let Coupon: any;
let AnimalEvent: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  process.env.FRONTEND_URL = 'https://mypetlive.es';
  delete process.env.STRIPE_SECRET_KEY; // asegura el camino gateado
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
  Coupon = (await import('../models/coupon.model')).Coupon;
  AnimalEvent = (await import('../models/animalEvent.model')).AnimalEvent;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const shelterId = new mongoose.Types.ObjectId().toHexString();
const storeId = new mongoose.Types.ObjectId().toHexString();
const adopterId = new mongoose.Types.ObjectId().toHexString();

const vetId = new mongoose.Types.ObjectId().toHexString();

const shelterH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const storeH = { 'x-user-id': storeId, 'x-user-role': 'store', 'x-user-verified': 'true' };
const vetH = { 'x-user-id': vetId, 'x-user-role': 'vet', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: shelterId, name: 'Protectora Lugo', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord', profile: { address: { city: 'Lugo' } } },
    { _id: storeId, name: 'Pet Market', email: 'store@test.com', passwordHash: 'x', role: 'store' },
    { _id: adopterId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
});

async function createAnimal(overrides: Record<string, any> = {}) {
  const res = await request(app)
    .post('/api/animals')
    .set(shelterH)
    .send({ shelter: shelterId, name: 'Milo', species: 'gato', sex: 'male', age: '2 años', size: 'small', status: 'publicado', ...overrides })
    .expect(201);
  return res.body;
}

describe('Pasaporte del animal', () => {
  it('registra el evento "created" y el pasaporte expone la línea de tiempo', async () => {
    const animal = await createAnimal();
    expect(animal.code).toBeTruthy();

    const res = await request(app).get(`/api/animals/passport/${animal.code}`).expect(200);
    expect(res.body.code).toBe(animal.code);
    expect(res.body.name).toBe('Milo');
    expect(Array.isArray(res.body.timeline)).toBe(true);
    expect(res.body.timeline.some((t: any) => t.type === 'created')).toBe(true);
    expect(res.body.provenance?.shelterName).toBe('Protectora Lugo');
  });

  it('el pasaporte público NO filtra datos del dueño', async () => {
    const animal = await createAnimal();
    const res = await request(app).get(`/api/animals/passport/${animal.code}`).expect(200);
    // No debe exponer ownerId/shelter ni el email de la protectora.
    expect(res.body.ownerId).toBeUndefined();
    expect(res.body.shelter).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('shelter@test.com');
    // Solo procedencia redactada (nombre + ciudad).
    expect(res.body.provenance).toEqual({ shelterName: 'Protectora Lugo', city: 'Lugo' });
  });

  it('devuelve 404 para un código inexistente o un animal todavía no publicado', async () => {
    await request(app).get('/api/animals/passport/NOEXISTE-999').expect(404);

    const draft = await createAnimal({ name: 'Borrador', status: 'borrador' });
    await request(app).get(`/api/animals/passport/${draft.code}`).expect(404);
  });

  it('no filtra nombre, email ni ids de la familia adoptante', async () => {
    const animal = await createAnimal({ name: 'Nora', status: 'adoptado' });
    await Animal.updateOne({ _id: animal._id }, { ownerId: adopterId });
    await AnimalEvent.create({
      animalId: animal._id,
      code: animal.code,
      type: 'adopted',
      shelterId,
      toOwnerId: adopterId,
      toOwnerType: 'tenant',
    });

    const res = await request(app).get(`/api/animals/passport/${animal.code}`).expect(200);
    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain('Ana');
    expect(payload).not.toContain('ana@test.com');
    expect(payload).not.toContain(adopterId);
    expect(res.body.ownerId).toBeUndefined();
  });

  it('unifica el vocabulario de especie en el alta (gato→cat, perro→dog)', async () => {
    const gato = await createAnimal({ name: 'Luna', species: 'gato' });
    const perro = await createAnimal({ name: 'Toby', species: 'perro' });
    expect(gato.species).toBe('cat');
    expect(perro.species).toBe('dog');
  });

  it('casa ofertas por especie incluyendo datos legados (perro≡dog)', async () => {
    // Animal legado insertado en crudo (sin pasar por el setter del modelo) con
    // la especie en español, como los datos sembrados antiguos.
    await Animal.collection.insertOne({
      _id: new mongoose.Types.ObjectId(),
      shelter: new mongoose.Types.ObjectId(shelterId),
      name: 'Nina', species: 'perro', sex: 'female', age: '1 año', size: 'medium',
      code: 'NINA-001', status: 'publicado', createdByRole: 'protectora', isPersonalPet: false,
      city: 'Madrid', createdAt: new Date(), updatedAt: new Date(),
    });

    // Cupón dirigido a "dog" (inglés) debe casar al animal "perro" (legado).
    await Coupon.create({ partnerId: storeId, partnerType: 'store', copy: 'Pienso perros -10%', discount: '10%', active: true, targetSpecies: ['dog'] });
    // Cupón dirigido a "cat" NO debe casar.
    await Coupon.create({ partnerId: storeId, partnerType: 'store', copy: 'Arena gatos', discount: '5%', active: true, targetSpecies: ['cat'] });

    const res = await request(app).get('/api/offers/for-animal/NINA-001').expect(200);
    const titles = res.body.items.map((o: any) => o.title);
    expect(titles).toContain('Pienso perros -10%');
    expect(titles).not.toContain('Arena gatos');
  });

  it('casa ofertas por especie, edad, tamaño, ciudad y código exacto', async () => {
    const animal = await createAnimal({
      name: 'Trufa',
      species: 'gato',
      ageGroup: 'adult',
      size: 'medium',
      city: 'A Coruña',
    });
    const base = { partnerId: storeId, partnerType: 'store', discount: '10%', active: true };

    await Coupon.create([
      { ...base, copy: 'Por especie', targetSpecies: ['cat'] },
      { ...base, copy: 'Por edad', targetAgeGroup: ['adult'] },
      { ...base, copy: 'Por tamaño', targetSize: ['medium'] },
      { ...base, copy: 'Por ciudad', targetCity: 'a coruña' },
      {
        ...base,
        copy: 'Por código exacto',
        targetAnimalCode: animal.code,
        targetSpecies: ['dog'],
        targetAgeGroup: ['puppy'],
        targetSize: ['large'],
        targetCity: 'Sevilla',
      },
      {
        ...base,
        copy: 'Combinación compatible',
        targetSpecies: ['cat'],
        targetAgeGroup: ['adult'],
        targetSize: ['medium'],
        targetCity: 'A CORUÑA',
      },
    ]);

    const res = await request(app).get(`/api/offers/for-animal/${animal.code}`).expect(200);
    const titles = res.body.items.map((offer: any) => offer.title);
    expect(titles).toEqual(expect.arrayContaining([
      'Por especie',
      'Por edad',
      'Por tamaño',
      'Por ciudad',
      'Por código exacto',
      'Combinación compatible',
    ]));
    expect(res.body.items).toHaveLength(6);
    expect(res.body.items[0]).toMatchObject({ title: 'Por código exacto', exact: true });
  });

  it('excluye ofertas caducadas, inactivas y combinaciones parcialmente incompatibles', async () => {
    const animal = await createAnimal({
      name: 'Leo',
      species: 'perro',
      ageGroup: 'young',
      size: 'small',
      city: 'Madrid',
    });
    const base = { partnerId: storeId, partnerType: 'store', discount: '5%' };

    await Coupon.create([
      { ...base, copy: 'Caducada', active: true, targetSpecies: ['dog'], expiresAt: new Date(Date.now() - 60_000) },
      { ...base, copy: 'Inactiva', active: false, targetSpecies: ['dog'] },
      { ...base, copy: 'Edad incorrecta', active: true, targetSpecies: ['dog'], targetAgeGroup: ['senior'] },
      { ...base, copy: 'Tamaño incorrecto', active: true, targetSpecies: ['dog'], targetSize: ['large'] },
      { ...base, copy: 'Ciudad incorrecta', active: true, targetSpecies: ['dog'], targetCity: 'Málaga' },
      { ...base, copy: 'Sin segmentación', active: true },
      { ...base, copy: 'Válida', active: true, targetSpecies: ['dog'], targetAgeGroup: ['young'], targetSize: ['small'], targetCity: 'Madrid' },
    ]);

    const res = await request(app).get(`/api/offers/for-animal/${animal.code}`).expect(200);
    expect(res.body.items.map((offer: any) => offer.title)).toEqual(['Válida']);
  });

  it('placement patrocinado gateado: sin Stripe queda pendiente y no se activa', async () => {
    const coupon = await Coupon.create({ partnerId: storeId, partnerType: 'store', copy: 'Destacar', discount: '15%', active: true });
    const res = await request(app)
      .post(`/api/offers/coupons/${coupon._id}/sponsor`)
      .set(storeH)
      .expect(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.configured).toBe(false);

    const updated = await Coupon.findById(coupon._id).lean();
    expect(updated.sponsored).toBe(false);
    expect(updated.sponsorshipStatus).toBe('pending');
  });

  it('un veterinario añade visita e hito de salud y el pasaporte los refleja', async () => {
    const animal = await createAnimal({ name: 'Bobby' });

    const visit = await request(app)
      .post(`/api/animals/${animal.code}/health`)
      .set(vetH)
      .send({ category: 'visit', note: 'Revisión general, sin incidencias', treatment: 'Ninguno' })
      .expect(201);
    expect(visit.body.health.vetVisits).toBe(1);

    await request(app)
      .post(`/api/animals/${animal.code}/health`)
      .set(vetH)
      .send({ category: 'vaccine', note: 'Trivalente' })
      .expect(201);

    const pass = await request(app).get(`/api/animals/passport/${animal.code}`).expect(200);
    expect(pass.body.health.vetVisits).toBe(1);
    expect(pass.body.health.healthMilestones).toBe(1);
    expect(pass.body.timeline.some((t: any) => t.type === 'vet')).toBe(true);
    expect(pass.body.timeline.some((t: any) => t.type === 'health')).toBe(true);
    // Sin duplicados: exactamente 1 entrada clínica por registro (no se repite el AnimalEvent).
    const clinical = pass.body.timeline.filter((t: any) => t.type === 'vet' || t.type === 'health');
    expect(clinical).toHaveLength(2);
  });

  it('ordena el linaje created/published/adopted/vet/health cronológicamente', async () => {
    const animal = await createAnimal({ name: 'Duna' });
    const createdEvent = await AnimalEvent.findOne({ animalId: animal._id, type: 'created' }).lean();
    const createdAt = new Date(createdEvent.createdAt).getTime();
    const dates = Array.from({ length: 5 }, (_, index) => new Date(createdAt + index * 60_000));

    await AnimalEvent.create([
      { animalId: animal._id, code: animal.code, type: 'published', shelterId, createdAt: dates[1] },
      {
        animalId: animal._id,
        code: animal.code,
        type: 'adopted',
        shelterId,
        toOwnerId: adopterId,
        toOwnerType: 'tenant',
        createdAt: dates[2],
      },
    ]);
    await Animal.updateOne(
      { _id: animal._id },
      {
        ownerId: adopterId,
        status: 'adoptado',
        vetHistory: [{ date: dates[3], note: 'Revisión anual' }],
        healthHistory: [{ date: dates[4], type: 'vaccine', notes: 'Rabia' }],
      },
    );

    const res = await request(app).get(`/api/animals/passport/${animal.code}`).expect(200);
    expect(res.body.timeline.map((event: any) => event.type)).toEqual([
      'created',
      'published',
      'adopted',
      'vet',
      'health',
    ]);
    expect(res.body.timeline.map((event: any) => new Date(event.at).toISOString())).toEqual(
      dates.map(date => date.toISOString()),
    );
  });

  it('genera la tarjeta Open Graph del QR del pasaporte', async () => {
    const animal = await createAnimal({
      name: 'Luna & Sol',
      description: 'Compañera tranquila',
      images: ['https://cdn.example.test/luna.jpg'],
    });

    const res = await request(app).get(`/og/p/${animal.code}`).expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.text).toContain(`<link rel="canonical" href="https://mypetlive.es/p/${animal.code}">`);
    expect(res.text).toContain('<meta property="og:type" content="website">');
    expect(res.text).toContain(`<meta property="og:title" content="Luna &amp; Sol · Pasaporte MyPetLive (${animal.code})">`);
    expect(res.text).toContain('<meta property="og:description" content="Compañera tranquila">');
    expect(res.text).toContain('<meta property="og:image" content="https://cdn.example.test/luna.jpg">');
    expect(res.text).toContain(`<meta property="og:url" content="https://mypetlive.es/p/${animal.code}">`);
    expect(res.text).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it('registro clínico exige nota y rechaza a no-veterinarios', async () => {
    const animal = await createAnimal({ name: 'Kira' });
    await request(app).post(`/api/animals/${animal.code}/health`).set(vetH).send({ category: 'visit' }).expect(400);
    // un adoptante (tenant) no puede registrar
    await request(app)
      .post(`/api/animals/${animal.code}/health`)
      .set({ 'x-user-id': adopterId, 'x-user-role': 'tenant', 'x-user-verified': 'true' })
      .send({ category: 'visit', note: 'x' })
      .expect(403);
    // código inexistente
    await request(app).post('/api/animals/NOEXISTE-999/health').set(vetH).send({ category: 'visit', note: 'x' }).expect(404);
  });

  it('un partner ajeno no puede patrocinar un cupón que no es suyo', async () => {
    const otherStore = new mongoose.Types.ObjectId().toHexString();
    const coupon = await Coupon.create({ partnerId: otherStore, partnerType: 'store', copy: 'X', discount: '1%', active: true });
    await request(app)
      .post(`/api/offers/coupons/${coupon._id}/sponsor`)
      .set(storeH)
      .expect(403);
  });
});
