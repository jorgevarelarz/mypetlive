import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

import { sendEmail } from '../utils/notification';

let mongo: MongoMemoryServer | undefined;
let User: any;
let Animal: any;
let VetAppointment: any;
let WelcomePlan: any;
let sendAppointmentReminders: (now?: Date) => Promise<number>;
let sendWelcomeReminders: (now?: Date) => Promise<number>;

const H = 60 * 60 * 1000;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.NODE_ENV = 'test';
  await mongoose.connect(mongo.getUri());
  User = (await import('../models/user.model')).User;
  Animal = (await import('../models/animal.model')).Animal;
  VetAppointment = (await import('../models/vetAppointment.model')).VetAppointment;
  WelcomePlan = (await import('../models/welcomePlan.model')).WelcomePlan;
  const jobs = await import('../jobs/reminders');
  sendAppointmentReminders = jobs.sendAppointmentReminders;
  sendWelcomeReminders = jobs.sendWelcomeReminders;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const vetId = new mongoose.Types.ObjectId();
const ownerId = new mongoose.Types.ObjectId();

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  (sendEmail as jest.Mock).mockClear();
  await User.create([
    {
      _id: vetId,
      name: 'Clínica Sur',
      email: 'vet@test.com',
      passwordHash: 'x',
      role: 'vet',
      profile: { orgName: 'Clínica Sur' },
    },
    { _id: ownerId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
  ]);
});

describe('Recordatorios de citas veterinarias', () => {
  const baseAppt = () => ({
    vetId,
    userId: ownerId,
    reason: 'Revisión anual',
    service: { name: 'Consulta general', priceEur: 30, pricingType: 'fijo' },
  });

  it('avisa a dueño y vet 24h antes, una sola vez', async () => {
    const now = new Date();
    const inTwelveHours = new Date(now.getTime() + 12 * H);
    await VetAppointment.create({ ...baseAppt(), requestedAt: inTwelveHours, scheduledAt: inTwelveHours, status: 'confirmed' });

    expect(await sendAppointmentReminders(now)).toBe(1);
    const recipients = (sendEmail as jest.Mock).mock.calls.map(c => c[0]);
    expect(recipients).toContain('ana@test.com');
    expect(recipients).toContain('vet@test.com');
    const toOwner = (sendEmail as jest.Mock).mock.calls.find(c => c[0] === 'ana@test.com');
    expect(toOwner[2]).toContain('Consulta general');

    // Segunda pasada: nada que enviar.
    (sendEmail as jest.Mock).mockClear();
    expect(await sendAppointmentReminders(now)).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('usa requestedAt si el vet no fijó otra fecha', async () => {
    const now = new Date();
    await VetAppointment.create({ ...baseAppt(), requestedAt: new Date(now.getTime() + 6 * H), status: 'confirmed' });
    expect(await sendAppointmentReminders(now)).toBe(1);
  });

  it('ignora citas lejanas, pasadas o sin confirmar', async () => {
    const now = new Date();
    await VetAppointment.create([
      { ...baseAppt(), requestedAt: new Date(now.getTime() + 48 * H), status: 'confirmed' }, // lejana
      { ...baseAppt(), requestedAt: new Date(now.getTime() - 2 * H), status: 'confirmed' }, // pasada
      { ...baseAppt(), requestedAt: new Date(now.getTime() + 6 * H), status: 'requested' }, // sin confirmar
      { ...baseAppt(), requestedAt: new Date(now.getTime() + 6 * H), status: 'cancelled' },
    ]);
    expect(await sendAppointmentReminders(now)).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('Recordatorio del plan de bienvenida', () => {
  let animalId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    const animal = await Animal.create({
      name: 'Luna',
      species: 'gato',
      sex: 'female',
      age: '2 años',
      size: 'small',
      isPersonalPet: true,
      ownerId,
      shelter: vetId,
      createdByRole: 'tenant',
    });
    animalId = animal._id;
  });

  it('a los 3 días con pasos pendientes, envía un único empujón con los que faltan', async () => {
    const now = new Date();
    await WelcomePlan.create({
      animalId,
      ownerId,
      activatedAt: new Date(now.getTime() - 4 * 24 * H),
      tasks: [{ key: 'vet_visit', doneAt: new Date() }],
    });

    expect(await sendWelcomeReminders(now)).toBe(1);
    const toOwner = (sendEmail as jest.Mock).mock.calls.find(c => c[0] === 'ana@test.com');
    expect(toOwner).toBeTruthy();
    expect(toOwner[2]).toContain('Luna');
    expect(toOwner[2]).not.toContain('visita al veterinario'); // la hecha no se lista
    expect(toOwner[2]).toContain('ofertas de bienvenida');

    (sendEmail as jest.Mock).mockClear();
    expect(await sendWelcomeReminders(now)).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('no molesta si el plan es reciente o ya está completo', async () => {
    const now = new Date();
    const allDone = (await import('../models/welcomePlan.model')).WELCOME_TASKS.map(t => ({
      key: t.key,
      doneAt: new Date(),
    }));
    await WelcomePlan.create([
      { animalId, ownerId, activatedAt: new Date(now.getTime() - 1 * 24 * H), tasks: [] }, // reciente
    ]);
    const other = await Animal.create({
      name: 'Michi', species: 'gato', sex: 'male', age: '1 año', size: 'small',
      isPersonalPet: true, ownerId, shelter: vetId, createdByRole: 'tenant',
    });
    await WelcomePlan.create({ animalId: other._id, ownerId, activatedAt: new Date(now.getTime() - 5 * 24 * H), tasks: allDone });

    expect(await sendWelcomeReminders(now)).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    // El completo queda marcado para no re-escanearlo.
    const done = await WelcomePlan.findOne({ animalId: other._id }).lean();
    expect(done.reminderSentAt).toBeTruthy();
  });
});
