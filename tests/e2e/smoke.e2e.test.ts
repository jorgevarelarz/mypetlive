import request from "supertest";
// Retries are optional; only used if supported by the environment
// @ts-ignore
jest.retryTimes?.(2);
import { app } from "../../src/app";
import { User } from "../../src/models/user.model";
import { Property } from "../../src/models/property.model";
import { Contract } from "../../src/models/contract.model";
import ProModel from "../../src/models/pro.model";
import { AlertSubscription } from "../../src/models/alertSubscription.model";
import { connectDb, disconnectDb, clearDb } from "../utils/db";

const PASSWORD = "Passw0rd!";
const NEW_PASSWORD = "NewPassw0rd!";

type Role = "landlord" | "tenant" | "pro";

async function register(email: string, role: Role, name = role.toUpperCase()) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name, email, password: PASSWORD, role })
    .expect(201);

  console.log(res.body);
  await new Promise(resolve => setTimeout(resolve, 2000));

  const user = await User.findOne({ email }).lean();
  if (!user) {
    throw new Error(`User ${email} was not created`);
  }
  return user;
}

async function login(email: string, password = PASSWORD) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password })
    .expect(200);
  return res.body.token as string;
}

function asUser(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

describe("E2E Smoke", () => {
  const prevSignProvider = process.env.SIGN_PROVIDER;
  jest.setTimeout(180_000);

  let landlord: any;
  let tenant: any;
  let pro: any;
  let propertyId: string;
  let contractId: string;
  let ticketId: string;
  let proDoc: any;

  beforeAll(async () => {
    process.env.ESCROW_DRIVER = "mock";
    process.env.PLATFORM_MIN_FEE_CENTS = "0";
    process.env.SIGN_PROVIDER = 'mock';
    process.env.SIGNATURE_CALLBACK_SECRET = 'test-secret';
    await connectDb();
    await clearDb();
  });

  afterAll(async () => {
    await clearDb();
    await disconnectDb();
    if (prevSignProvider === undefined) {
      delete process.env.SIGN_PROVIDER;
    } else {
      process.env.SIGN_PROVIDER = prevSignProvider;
    }
  });

  it("bootstrap users & logins", async () => {
    landlord = await register("landlord@test.com", "landlord", "Landlord");
    tenant = await register("tenant@test.com", "tenant", "Tenant");
    pro = await register("pro@test.com", "pro", "Pro");

    proDoc = await ProModel.create({
      userId: String(pro._id),
      displayName: "Fontanero E2E",
      city: "A Coruña",
      services: [{ key: "plumbing", basePrice: 120 }],
      verified: true,
      active: true,
    });

    const landlordToken = await login("landlord@test.com");
    const tenantToken = await login("tenant@test.com");
    const proToken = await login("pro@test.com");

    expect(landlordToken && tenantToken && proToken).toBeTruthy();
  });

  it("clauses catalog multi-region (Galicia)", async () => {
    const res = await request(app)
      .get("/api/clauses?region=galicia&version=1.0.0")
      .expect(200);
    const hasIGVS = !!res.body.items.find((i: any) => i.id === "fianza_autonomica");
    expect(hasIGVS).toBe(true);
  });

  it("landlord creates & publishes property (owner verified, >=3 images)", async () => {
    const landlordToken = await login("landlord@test.com");
    const create = await request(app)
      .post("/api/properties")
      .set(asUser(landlordToken))
      .send({
        owner: landlord._id,
        title: "Piso céntrico prueba",
        address: "C/ Mayor 1",
        region: "galicia",
        city: "A Coruña",
        location: { lng: -8.409, lat: 43.362 },
        price: 850,
        deposit: 850,
        sizeM2: 70,
        rooms: 2,
        bathrooms: 1,
        furnished: true,
        petsAllowed: false,
        availableFrom: "2025-10-01",
        images: ["https://cdn/x1.jpg", "https://cdn/x2.jpg", "https://cdn/x3.jpg"],
      })
      .expect(201);

    propertyId = create.body._id;
    expect(create.body.status).toBe("draft");

    const pub = await request(app)
      .post(`/api/properties/${propertyId}/publish`)
      .set(asUser(landlordToken))
      .send()
      .expect(200);
    expect(pub.body.status).toBe("active");

    const stored = await Property.findById(propertyId).lean();
    expect(stored?.status).toBe("active");
  });

  it("search properties + favorite + alerts mock", async () => {
    const tenantToken = await login("tenant@test.com");
    const list = await request(app)
      .get("/api/properties?city=A Coruña&priceMax=1000&limit=5")
      .expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);

    await request(app)
      .post(`/api/properties/${propertyId}/favorite`)
      .set(asUser(tenantToken))
      .send()
      .expect(200);

    await request(app)
      .post(`/api/properties/${propertyId}/subscribe-price`)
      .set(asUser(tenantToken))
      .send()
      .expect(200);

    const sub = await AlertSubscription.findOne({ propertyId, type: "price" }).lean();
    expect(sub).toBeTruthy();
  });

  it("create contract (Galicia) + PDF + hash + idempotent signature + activate", async () => {
    const landlordToken = await login("landlord@test.com");
    const create = await request(app)
      .post("/api/contracts")
      .set(asUser(landlordToken))
      .send({
        landlord: landlord._id,
        tenant: tenant._id,
        property: propertyId,
        region: "galicia",
        rent: 750,
        deposit: 750,
        startDate: new Date(Date.now() - 86_400_000).toISOString(),
        endDate: "2026-09-30",
        clauses: [
          { id: "duracion_prorroga", params: { mesesIniciales: 12, mesesProrroga: 12 } },
          { id: "fianza_autonomica", params: {} },
        ],
      })
      .expect(201);

    contractId = create.body.contract._id;
    expect(create.body.contract.pdfHash).toMatch(/^[a-f0-9]{64}$/);

    const evt = { eventId: "evt_e2e_1", provider: "mock", status: "signed" };
    const first = await request(app)
      .post(`/api/contracts/${contractId}/signature/callback`)
      .set('x-signature-secret', 'test-secret')
      .send(evt)
      .expect(200);
    expect(first.body.status).toBe("signed");

    const second = await request(app)
      .post(`/api/contracts/${contractId}/signature/callback`)
      .set('x-signature-secret', 'test-secret')
      .send(evt)
      .expect(200);
    expect(second.body.idempotent || second.body.alreadyFinalized).toBeTruthy();

    const act = await request(app)
      .post(`/api/contracts/${contractId}/activate`)
      .set(asUser(landlordToken))
      .send()
      .expect(200);
    expect(act.body.status).toBe("active");

    const stored = await Contract.findById(contractId).lean();
    expect(stored?.status).toBe("active");
  });

  it("tenant opens ticket; landlord assigns pro; pro quotes; landlord approves (escrow mock); pro extra flow; complete & close", async () => {
    const tenantToken = await login("tenant@test.com");
    const landlordToken = await login("landlord@test.com");
    const proToken = await login("pro@test.com");
    const open = await request(app)
      .post("/api/tickets")
      .set(asUser(tenantToken))
      .send({
        contractId,
        ownerId: String(landlord._id),
        propertyId,
        service: "plumbing",
        title: "Gotera en baño",
        description: "Se cae agua por el falso techo",
      })
      .expect(201);

    ticketId = open.body._id;

    const assigned = await request(app)
      .post(`/api/tickets/${ticketId}/assign`)
      .set(asUser(landlordToken))
      .send({ proId: String(proDoc._id) })
      .expect(200);
    expect(assigned.body.ticket.proId).toBe(String(pro._id));

    await request(app)
      .post(`/api/tickets/${ticketId}/quote`)
      .set(asUser(proToken))
      .send({ amount: 180, note: "Material + mano de obra" })
      .expect(200);

    await request(app)
      .post(`/api/tickets/${ticketId}/approve`)
      .set(asUser(landlordToken))
      .send({ customerId: "cus_mock" })
      .expect(200);

    await request(app)
      .post(`/api/tickets/${ticketId}/extra`)
      .set(asUser(proToken))
      .send({ amount: 30, reason: "Codo adicional" })
      .expect(200);

    await request(app)
      .post(`/api/tickets/${ticketId}/extra/decide`)
      .set(asUser(landlordToken))
      .send({ approve: true })
      .expect(200);

    await request(app)
      .post(`/api/tickets/${ticketId}/complete`)
      .set(asUser(proToken))
      .send({ invoiceUrl: "https://files/invoice.pdf" })
      .expect(200);

    await request(app)
      .post(`/api/tickets/${ticketId}/resolve`)
      .set(asUser(tenantToken))
      .send()
      .expect(200);
  });

  it("soft-delete property hides it from active listings", async () => {
    const landlordToken = await login("landlord@test.com");
    await request(app)
      .post(`/api/properties/${propertyId}/archive`)
      .set(asUser(landlordToken))
      .send()
      .expect(200);

    const stored = await Property.findById(propertyId).lean();
    expect(stored?.status).toBe("archived");

    const list = await request(app)
      .get("/api/properties?city=A Coruña&limit=20")
      .expect(200);
    const exists = list.body.items.find((item: any) => item._id === propertyId);
    expect(!exists || exists.status !== "active").toBe(true);
  });

  it("password reset flow works (request + reset)", async () => {
    await request(app)
      .post("/api/auth/request-reset")
      .send({ email: "tenant@test.com" })
      .expect(200);

    const user = await User.findOne({ email: "tenant@test.com" });
    expect(user?.resetToken && user?.resetTokenExp).toBeTruthy();

    await request(app)
      .post("/api/auth/reset")
      .send({ token: user!.resetToken, password: NEW_PASSWORD })
      .expect(200);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "tenant@test.com", password: NEW_PASSWORD })
      .expect(200);
  });
});
