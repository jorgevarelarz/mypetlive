import request from "supertest";
import { app } from "../../src/app";
import { connectDb, disconnectDb, clearDb } from "../utils/db";

describe("Contract lifecycle", () => {
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
      startDate: new Date(Date.now() - 86400000).toISOString(),
      endDate: "2026-09-30",
      clauses: [{ id: "duracion_prorroga", params: { mesesIniciales: 12, mesesProrroga: 12 } }],
    });
    id = res.body.contract._id;
  });

  it("pasa a signed con el callback mock", async () => {
    const res = await request(app)
      .post(`/api/contracts/${id}/signature/callback`)
      .set('x-signature-secret', 'test-secret')
      .send({ eventId: `evt_${Date.now()}_signed`, provider: "mock", status: "signed" })
      .expect(200);
    expect(res.body.status).toBe("signed");
  });

  it("activa si la fecha de inicio ya llegó", async () => {
    await request(app)
      .post(`/api/contracts/${id}/signature/callback`)
      .set('x-signature-secret', 'test-secret')
      .send({ eventId: `evt_${Date.now()}_activate`, provider: "mock", status: "signed" })
      .expect(200);
    const res = await request(app).post(`/api/contracts/${id}/activate`).send().expect(200);
    expect(res.body.status).toBe("active");
  });

  it("termina el contrato", async () => {
    await request(app)
      .post(`/api/contracts/${id}/signature/callback`)
      .set('x-signature-secret', 'test-secret')
      .send({ eventId: `evt_${Date.now()}_terminate`, provider: "mock", status: "signed" })
      .expect(200);
    await request(app).post(`/api/contracts/${id}/activate`).send().expect(200);
    const res = await request(app)
      .post(`/api/contracts/${id}/terminate`)
      .send({ reason: "mutuo_acuerdo" })
      .expect(200);
    expect(res.body.status).toBe("terminated");
  });
});
