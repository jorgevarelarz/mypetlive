import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

const mockTransfersCreate = jest.fn();
jest.mock('../utils/stripe', () => ({
  isStripeConfigured: () => true,
  getStripeClient: () => ({ transfers: { create: mockTransfersCreate } }),
}));

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let PatitaTxn: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  process.env.PATITA_VALUE_EUR = '0.10';
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  PatitaTxn = (await import('../models/patitaTxn.model')).PatitaTxn;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const shelterId = new mongoose.Types.ObjectId().toHexString();
const storeId = new mongoose.Types.ObjectId().toHexString();
const shelterH = { 'x-user-id': shelterId, 'x-user-role': 'landlord', 'x-user-verified': 'true' };
const storeH = { 'x-user-id': storeId, 'x-user-role': 'store', 'x-user-verified': 'true' };

beforeEach(async () => {
  mockTransfersCreate.mockReset();
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    { _id: shelterId, name: 'Protectora Lugo', email: 'shelter@test.com', passwordHash: 'x', role: 'landlord', patitas: 100 },
    { _id: storeId, name: 'Tienda Mascotas', email: 'store@test.com', passwordHash: 'x', role: 'store', stripeAccountId: 'acct_synthetic' },
  ]);
});

async function redeem(amount: number) {
  const wallet = await request(app).get('/api/patitas/wallet/token').set(shelterH).expect(200);
  return request(app)
    .post('/api/patitas/redeem/confirm')
    .set(storeH)
    .send({ walletToken: wallet.body.token, amount })
    .expect(200);
}

describe('Canje de Patitas: transferencia con clave de idempotencia', () => {
  it('pasa idempotencyKey redeem-<code> como segundo argumento de transfers.create', async () => {
    mockTransfersCreate.mockResolvedValue({ id: 'tr_synthetic' });
    const res = await redeem(40);
    expect(res.body.code).toMatch(/^MPL-/);
    expect(mockTransfersCreate).toHaveBeenCalledTimes(1);
    expect(mockTransfersCreate.mock.calls[0][1]).toEqual({ idempotencyKey: 'redeem-' + res.body.code });
    const txn = await PatitaTxn.findOne({ code: res.body.code }).lean();
    expect(txn).toBeTruthy();
  });

  it('si la transferencia va bien, el canje queda pagado con payoutRef', async () => {
    mockTransfersCreate.mockResolvedValue({ id: 'tr_ok' });
    const res = await redeem(40);
    expect(res.body.payoutStatus).toBe('paid');
    const txn = await PatitaTxn.findOne({ code: res.body.code }).lean();
    expect(txn.status).toBe('paid');
    expect(txn.payoutRef).toBe('tr_ok');
  });

  it('si la transferencia falla por timeout, queda en pending_payout y la llamada ya llevaba la clave', async () => {
    mockTransfersCreate.mockRejectedValue(new Error('timeout'));
    const res = await redeem(40);
    expect(res.body.payoutStatus).toBe('pending_payout');
    const txn = await PatitaTxn.findOne({ code: res.body.code }).lean();
    expect(txn.status).toBe('pending_payout');
    expect(txn.payoutRef).toBeFalsy();
    expect(mockTransfersCreate).toHaveBeenCalledTimes(1);
    expect(mockTransfersCreate.mock.calls[0][1]).toEqual({ idempotencyKey: `redeem-${res.body.code}` });
  });

  it('dos canjes distintos usan claves distintas', async () => {
    mockTransfersCreate.mockResolvedValueOnce({ id: 'tr_1' }).mockResolvedValueOnce({ id: 'tr_2' });
    const first = await redeem(10);
    const second = await redeem(20);
    expect(first.body.code).not.toBe(second.body.code);
    expect(mockTransfersCreate).toHaveBeenCalledTimes(2);
    expect(mockTransfersCreate.mock.calls[0][1]).toEqual({ idempotencyKey: `redeem-${first.body.code}` });
    expect(mockTransfersCreate.mock.calls[1][1]).toEqual({ idempotencyKey: `redeem-${second.body.code}` });
  });
});
