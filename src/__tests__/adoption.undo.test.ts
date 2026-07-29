import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { User } from '../models/user.model';
import { Verification } from '../models/verification.model';
import { Animal } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { WelcomePlan } from '../models/welcomePlan.model';
import { AnimalEvent } from '../models/animalEvent.model';

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

const shelterId = new mongoose.Types.ObjectId().toHexString();
const adopterId = new mongoose.Types.ObjectId().toHexString();
const otherAdopterId = new mongoose.Types.ObjectId().toHexString();
const adminId = new mongoose.Types.ObjectId().toHexString();

const protectoraH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const adopterH = { 'x-user-id': adopterId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const otherAdopterH = { 'x-user-id': otherAdopterId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const adminH = { 'x-user-id': adminId, 'x-user-role': 'admin', 'x-user-verified': 'true' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: shelterId, name: 'Protectora Sur', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord' },
    { _id: adopterId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: otherAdopterId, name: 'Bruno', email: 'bruno@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: adminId, name: 'Admin', email: 'admin@test.com', passwordHash: 'x', role: 'admin' },
  ]);
  await Verification.create({ userId: shelterId, status: 'verified', verificationLevel: 'animal_protection_entity' });
});

/** Animal publicado de la protectora. */
async function publishedAnimal() {
  const create = await request(app)
    .post('/api/animals')
    .set(protectoraH)
    .send({ shelter: shelterId, name: 'Nala', species: 'perro', sex: 'female', age: '3 años', size: 'medium' })
    .expect(201);
  const animalId = create.body._id;
  await request(app).patch(`/api/animals/${animalId}/status`).set(protectoraH).send({ status: 'publicado' }).expect(200);
  return animalId;
}

const setStatus = (id: string, status: string, headers: Record<string, string> = protectoraH) =>
  request(app).patch(`/api/adoptions/${id}/status`).set(headers).send({ status });

const undo = (id: string, body: any = { reason: 'La familia se echó atrás' }, headers = protectoraH) =>
  request(app).post(`/api/adoptions/${id}/undo-approval`).set(headers).send(body);

/** Animal publicado + solicitud aprobada. Devuelve también una hermana cerrada al adjudicar. */
async function approvedAdoption() {
  const animalId = await publishedAnimal();
  const mine = await request(app).post('/api/adoptions').set(adopterH).send({ animalId }).expect(201);
  const sibling = await request(app).post('/api/adoptions').set(otherAdopterH).send({ animalId }).expect(201);
  await setStatus(sibling.body.id, 'en_revision').expect(200);

  await setStatus(mine.body.id, 'en_revision').expect(200);
  await setStatus(mine.body.id, 'preaprobada').expect(200);
  await setStatus(mine.body.id, 'aprobada').expect(200);
  return { animalId, adoptionId: mine.body.id, siblingId: sibling.body.id };
}

describe('Deshacer la aprobación de una adopción', () => {
  it('devuelve el animal a la protectora y la solicitud a preaprobada', async () => {
    const { animalId, adoptionId } = await approvedAdoption();

    // Estado de partida: el animal es del adoptante.
    const adopted = await Animal.findById(animalId).lean();
    expect(String(adopted?.ownerId)).toBe(adopterId);
    expect(adopted?.status).toBe('adoptado');
    expect(adopted?.isPersonalPet).toBe(true);

    const res = await undo(adoptionId).expect(200);
    expect(res.body.status).toBe('preaprobada');

    const reverted = await Animal.findById(animalId).lean();
    expect(String(reverted?.ownerId)).toBe(shelterId);
    expect(reverted?.isPersonalPet).toBe(false);
    expect(reverted?.createdByRole).toBe('protectora');
    // 'reservado', no 'publicado': volver al escaparate lo decide la protectora.
    expect(reverted?.status).toBe('reservado');

    const adoption = await Adoption.findById(adoptionId).lean();
    expect(adoption?.status).toBe('preaprobada');
  });

  it('retira el plan de bienvenida y reabre las candidaturas hermanas', async () => {
    const { animalId, adoptionId, siblingId } = await approvedAdoption();

    expect(await WelcomePlan.countDocuments({ animalId })).toBe(1);
    const closed = await Adoption.findById(siblingId).lean();
    expect(closed?.status).toBe('rechazada');

    const res = await undo(adoptionId).expect(200);
    expect(res.body.reopenedApplications).toBe(1);

    expect(await WelcomePlan.countDocuments({ animalId })).toBe(0);
    // Vuelve exactamente a donde estaba, no a un estado por defecto.
    const reopened = await Adoption.findById(siblingId).lean();
    expect(reopened?.status).toBe('en_revision');
  });

  it('la ficha dice cuántas candidaturas cerró la aprobación', async () => {
    // El aviso de "deshacer" promete reabrirlas por número: tiene que ser el real.
    const { adoptionId } = await approvedAdoption();
    const detail = await request(app).get(`/api/adoptions/${adoptionId}`).set(protectoraH).expect(200);
    expect(detail.body.closedSiblings).toBe(1);

    await undo(adoptionId).expect(200);
    const after = await request(app).get(`/api/adoptions/${adoptionId}`).set(protectoraH).expect(200);
    expect(after.body.closedSiblings).toBeUndefined();
  });

  it('compensa el linaje en vez de reescribirlo', async () => {
    const { animalId, adoptionId } = await approvedAdoption();
    await undo(adoptionId).expect(200);

    const events = await AnimalEvent.find({ animalId }).sort({ createdAt: 1 }).lean();
    const types = events.map(e => e.type);
    // El 'adopted' sigue ahí; el 'returned' lo compensa.
    expect(types).toContain('adopted');
    expect(types).toContain('returned');
    const back = events.find(e => e.type === 'returned');
    expect(String(back?.toOwnerId)).toBe(shelterId);
    expect(String(back?.fromOwnerId)).toBe(adopterId);
  });

  it('deja el motivo en el historial', async () => {
    const { adoptionId } = await approvedAdoption();
    await undo(adoptionId, { reason: 'Aprobada por error, era otra solicitud' }).expect(200);

    const adoption = await Adoption.findById(adoptionId).lean();
    const entry = (adoption?.history || []).find(h => h.action === 'undo_approval');
    expect(entry).toBeTruthy();
    expect((entry?.payload as any)?.reason).toBe('Aprobada por error, era otra solicitud');
    expect((entry?.payload as any)?.by).toBe('shelter');
  });

  it('exige motivo', async () => {
    const { adoptionId } = await approvedAdoption();
    const res = await undo(adoptionId, {}).expect(400);
    expect(res.body.error).toBe('reason_required');

    const untouched = await Adoption.findById(adoptionId).lean();
    expect(untouched?.status).toBe('aprobada');
  });

  it('solo desde aprobada', async () => {
    const animalId = await publishedAnimal();
    const apply = await request(app).post('/api/adoptions').set(adopterH).send({ animalId }).expect(201);
    await setStatus(apply.body.id, 'en_revision').expect(200);

    const res = await undo(apply.body.id).expect(409);
    expect(res.body.error).toBe('not_approved');
    expect(res.body.status).toBe('en_revision');
  });

  it('otra protectora no puede deshacer una adopción ajena', async () => {
    const { adoptionId } = await approvedAdoption();
    const strangerId = new mongoose.Types.ObjectId().toHexString();
    await User.create({ _id: strangerId, name: 'Otra', email: 'otra@test.com', passwordHash: 'x', role: 'landlord' });
    const strangerH = { 'x-user-id': strangerId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };

    await undo(adoptionId, { reason: 'quiero deshacerla' }, strangerH).expect(403);
  });

  it('fuera de la ventana la protectora ya no puede, el admin sí', async () => {
    const { adoptionId } = await approvedAdoption();

    // Se envejece la aprobación en el historial: cuatro días atrás.
    const old = new Date(Date.now() - 96 * 3_600_000);
    const adoption = await Adoption.findById(adoptionId);
    const approval = (adoption!.history || []).find(
      h => h.action === 'status_change' && (h.payload as any)?.status === 'aprobada',
    );
    approval!.ts = old;
    adoption!.markModified('history');
    await adoption!.save();

    const denied = await undo(adoptionId).expect(403);
    expect(denied.body.error).toBe('undo_window_expired');
    expect(denied.body.windowHours).toBe(72);

    // El admin no tiene ventana: si hay que arreglar algo raro, se arregla.
    await undo(adoptionId, { reason: 'Reversión pedida por la protectora fuera de plazo' }, adminH).expect(200);
    const reverted = await Adoption.findById(adoptionId).lean();
    expect(reverted?.status).toBe('preaprobada');
    const entry = (reverted?.history || []).find(h => h.action === 'undo_approval');
    expect((entry?.payload as any)?.by).toBe('admin');
  });

  it('no revierte si el animal ya ha cambiado de manos', async () => {
    const { animalId, adoptionId } = await approvedAdoption();
    // Alguien lo movió después: revertir aquí pisaría esa historia.
    await Animal.updateOne({ _id: animalId }, { $set: { ownerId: new mongoose.Types.ObjectId(otherAdopterId) } });

    const res = await undo(adoptionId).expect(409);
    expect(res.body.error).toBe('animal_moved_on');
  });

  it('el adoptante no puede deshacer su propia aprobación', async () => {
    const { adoptionId } = await approvedAdoption();
    await undo(adoptionId, { reason: 'me arrepiento' }, adopterH).expect(403);
  });
});
