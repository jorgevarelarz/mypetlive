import request from "supertest";
import { app } from "../../src/app";
import { connectDb, disconnectDb, clearDb } from "../utils/db";

describe("Signature callback idempotency", () => {
  const prevSignProvider = process.env.SIGN_PROVIDER;
  let id: string;

  beforeAll(async () => {
    process.env.SIGN_PROVIDER = 'mock';
    process.env.SIGNATURE_CALLBACK_SECRET = 'test-secret';
    await connectDb();
  });
  afterAll(async () => {
    await disconnectDb();
    if (prevSignProvider === undefined) {
      delete process.env.SIGN_PROVIDER;
    } else {
      process.env.SIGN_PROVIDER = prevSignProvider;
    }
  });
  afterEach(clearDb);

  beforeEach(async () => {
    const res = await request(app).post("/api/contracts").send({
      landlord: "507f1f77bcf86cd799439011",
      tenant: "507f1f77bcf86cd799439012",
      property: "507f1f77bcf86cd799439013",
      region: "galicia",
      rent: 750,
      deposit: 750,
      startDate: "2025-10-01",
      endDate: "2026-09-30",
      clauses: [{ id: "duracion_prorroga", params: { mesesIniciales: 12, mesesProrroga: 12 } }],
    });
    id = res.body.contract._id;
  });

  it("processes first event and ignores duplicates", async () => {
    const payload = { eventId: "evt_123", provider: "mock", status: "signed" };

    const first = await request(app)
      .post(`/api/contracts/${id}/signature/callback`)
      .set('x-signature-secret', 'test-secret')
      .send(payload)
      .expect(200);
    expect(first.body.status).toBe("signed");

    const second = await request(app)
      .post(`/api/contracts/${id}/signature/callback`)
      .set('x-signature-secret', 'test-secret')
      .send(payload)
      .expect(200);
    expect(second.body.idempotent || second.body.alreadyFinalized).toBeTruthy();
  });
});
