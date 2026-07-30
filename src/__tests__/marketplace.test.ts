import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';
import { orderTotals, shippingFor, priceFromCost, ORDER_MAX_EUR } from '../utils/marketplace';

jest.mock('../utils/notification', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

let app: any;
let mongo: MongoMemoryServer | undefined;
let User: any;
let Product: any;
let Order: any;
let fulfillPaidOrder: any;

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNVERIFIED = 'true';
  // Sin clave de Stripe a propósito: el checkout deja el pedido creado y
  // devuelve 503, que es justo lo que hace falta para probar todo lo de antes
  // del cobro sin hablar con Stripe.
  delete process.env.STRIPE_SECRET_KEY;
  const mod = await import('../app');
  app = mod.app || mod.default;
  User = (await import('../models/user.model')).User;
  Product = (await import('../models/product.model')).Product;
  Order = (await import('../models/order.model')).Order;
  fulfillPaidOrder = (await import('../controllers/marketplace.controller')).fulfillPaidOrder;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

const storeId = new mongoose.Types.ObjectId().toHexString();
const store2Id = new mongoose.Types.ObjectId().toHexString();
const buyerId = new mongoose.Types.ObjectId().toHexString();
const otherId = new mongoose.Types.ObjectId().toHexString();
const adminId = new mongoose.Types.ObjectId().toHexString();

const storeH = { 'x-user-id': storeId, 'x-user-role': 'store', 'x-user-verified': 'true' };
const store2H = { 'x-user-id': store2Id, 'x-user-role': 'store', 'x-user-verified': 'true' };
const buyerH = { 'x-user-id': buyerId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const otherH = { 'x-user-id': otherId, 'x-user-role': 'tenant', 'x-user-verified': 'true' };
const adminH = { 'x-user-id': adminId, 'x-user-role': 'admin', 'x-user-verified': 'true' };

const address = { line1: 'Rúa Real 12', city: 'A Coruña', postalCode: '15003' };

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await User.create([
    {
      _id: storeId,
      name: 'Tienda Norte',
      email: 'store@test.com',
      passwordHash: 'x',
      role: 'store',
      profile: { address: { city: 'A Coruña' }, marketplace: { shippingEur: 3.5, freeFromEur: 40 } },
    },
    { _id: store2Id, name: 'Tienda Sur', email: 'store2@test.com', passwordHash: 'x', role: 'store' },
    { _id: buyerId, name: 'Ana', email: 'ana@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: otherId, name: 'Luis', email: 'luis@test.com', passwordHash: 'x', role: 'tenant' },
    { _id: adminId, name: 'Admin', email: 'admin@test.com', passwordHash: 'x', role: 'admin' },
  ]);
});

async function seedProduct(overrides: Record<string, any> = {}) {
  return Product.create({
    listedBy: 'partner',
    sellerId: storeId,
    name: 'Pienso cachorro 3kg',
    category: 'comida',
    priceEur: 20,
    stock: 10,
    ...overrides,
  });
}

// ------------------------------------------------------------------ dinero

describe('Reglas de dinero', () => {
  it('cobra comisión sobre el producto y nunca sobre los portes', () => {
    const totals = orderTotals([{ name: 'Pienso', priceEur: 20, qty: 2 }], {
      listedBy: 'partner',
      shippingEur: 4.9,
      commissionPct: 8,
    });
    expect(totals.subtotalEur).toBe(40);
    expect(totals.totalEur).toBe(44.9);
    // 8% de 40, no de 44,90: el porte es del transportista, no margen de la tienda.
    expect(totals.commissionEur).toBe(3.2);
  });

  it('no cobra comisión en lo que vendemos nosotros y anota el margen', () => {
    const totals = orderTotals([{ name: 'Arena', priceEur: 12, qty: 1, costEur: 8 }], {
      listedBy: 'platform',
      shippingEur: 4.9,
    });
    expect(totals.commissionEur).toBe(0);
    expect(totals.commissionPct).toBe(0);
    expect(totals.platformMarginEur).toBe(4);
  });

  it('aplica el envío gratis a partir del umbral de cada vendedor', () => {
    expect(shippingFor(39, { shippingEur: 3.5, freeFromEur: 40 })).toBe(3.5);
    expect(shippingFor(40, { shippingEur: 3.5, freeFromEur: 40 })).toBe(0);
  });

  it('deriva el precio del coste con el sobrecoste por defecto', () => {
    expect(priceFromCost(10)).toBe(11.5);
  });
});

// ---------------------------------------------------------------- catálogo

describe('Catálogo público', () => {
  it('no expone nunca el coste de proveedor', async () => {
    await seedProduct({ listedBy: 'platform', sellerId: undefined, costEur: 8, priceEur: 12 });

    const list = await request(app).get('/api/marketplace/products').expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).not.toHaveProperty('costEur');

    const detail = await request(app)
      .get(`/api/marketplace/products/${list.body.items[0].id}`)
      .expect(200);
    expect(detail.body).not.toHaveProperty('costEur');
  });

  it('esconde lo inactivo y lo agotado', async () => {
    await seedProduct({ name: 'Agotado', stock: 0 });
    await seedProduct({ name: 'Retirado', active: false });
    await seedProduct({ name: 'A la venta' });

    const res = await request(app).get('/api/marketplace/products').expect(200);
    expect(res.body.items.map((p: any) => p.name)).toEqual(['A la venta']);
  });

  it('filtra por especie casando las variantes es/en y respetando lo genérico', async () => {
    await seedProduct({ name: 'Pienso perro', species: ['perro'] });
    await seedProduct({ name: 'Pienso gato', species: ['cat'] });
    await seedProduct({ name: 'Comedero universal', species: [] });

    const res = await request(app).get('/api/marketplace/products?species=dog').expect(200);
    const names = res.body.items.map((p: any) => p.name).sort();
    expect(names).toEqual(['Comedero universal', 'Pienso perro']);
  });

  it('devuelve los portes que tocan en la ficha', async () => {
    const product = await seedProduct({ priceEur: 20 });
    const res = await request(app).get(`/api/marketplace/products/${product._id}`).expect(200);
    expect(res.body.shippingEur).toBe(3.5);
    expect(res.body.seller.name).toBe('Tienda Norte');
  });
});

// ------------------------------------------------------------ alta y borrado

describe('Alta de productos', () => {
  it('no deja a una tienda listar en nombre de la plataforma', async () => {
    const res = await request(app)
      .post('/api/marketplace/products')
      .set(storeH)
      .send({ listedBy: 'platform', name: 'Mío pero tuyo', priceEur: 10, costEur: 4 })
      .expect(201);

    expect(res.body.product.listedBy).toBe('partner');
    expect(String(res.body.product.sellerId)).toBe(storeId);
    expect(res.body.product.costEur).toBeUndefined();
  });

  it('rechaza vender por debajo del coste', async () => {
    const res = await request(app)
      .post('/api/marketplace/products')
      .set(adminH)
      .send({ listedBy: 'platform', name: 'Pérdida', priceEur: 5, costEur: 9 })
      .expect(400);
    expect(res.body.error).toBe('price_below_cost');
  });

  it('calcula el precio desde el coste cuando el admin no lo fija', async () => {
    const res = await request(app)
      .post('/api/marketplace/products')
      .set(adminH)
      .send({ listedBy: 'platform', name: 'Arena', costEur: 10 })
      .expect(201);
    expect(res.body.product.priceEur).toBe(11.5);
  });

  it('cierra el alta a quien no es tienda', async () => {
    await request(app)
      .post('/api/marketplace/products')
      .set(buyerH)
      .send({ name: 'No debería', priceEur: 10 })
      .expect(403);
  });

  it('no deja a una tienda tocar el producto de otra', async () => {
    const product = await seedProduct();
    await request(app)
      .post('/api/marketplace/products')
      .set(store2H)
      .send({ id: String(product._id), name: 'Secuestrado', priceEur: 1 })
      .expect(403);
  });

  it('retira en vez de borrar lo que ya se ha vendido', async () => {
    const product = await seedProduct();
    await Order.create({
      reference: 'MP-TEST-0001',
      listedBy: 'partner',
      sellerId: storeId,
      buyer: { email: 'ana@test.com', name: 'Ana' },
      items: [{ productId: product._id, name: product.name, priceEur: 20, qty: 1 }],
      shippingAddress: { ...address, country: 'ES' },
      subtotalEur: 20,
      shippingEur: 3.5,
      totalEur: 23.5,
    });

    const res = await request(app)
      .delete(`/api/marketplace/products/${product._id}`)
      .set(storeH)
      .expect(200);
    expect(res.body.retired).toBe(true);

    // Sigue existiendo: si desapareciera, el pedido antiguo dejaría de poder explicarse.
    const kept = await Product.findById(product._id).lean();
    expect(kept.active).toBe(false);
  });
});

// ---------------------------------------------------------------- checkout

describe('Checkout', () => {
  it('no mezcla dos vendedores en un pedido', async () => {
    const a = await seedProduct();
    const b = await seedProduct({ sellerId: store2Id, name: 'De la otra tienda' });

    const res = await request(app)
      .post('/api/marketplace/checkout')
      .set(buyerH)
      .send({ items: [{ productId: a._id, qty: 1 }, { productId: b._id, qty: 1 }], shippingAddress: address })
      .expect(400);
    expect(res.body.error).toBe('mixed_sellers');
  });

  it('exige una dirección completa', async () => {
    const product = await seedProduct();
    const res = await request(app)
      .post('/api/marketplace/checkout')
      .set(buyerH)
      .send({ items: [{ productId: product._id, qty: 1 }], shippingAddress: { city: 'A Coruña' } })
      .expect(400);
    expect(res.body.error).toBe('address_incomplete');
  });

  it('suma las líneas repetidas antes de mirar el stock', async () => {
    const product = await seedProduct({ stock: 3 });
    const res = await request(app)
      .post('/api/marketplace/checkout')
      .set(buyerH)
      .send({
        items: [{ productId: product._id, qty: 2 }, { productId: product._id, qty: 2 }],
        shippingAddress: address,
      })
      .expect(409);
    expect(res.body.error).toBe('out_of_stock');
    expect(res.body.stock).toBe(3);
  });

  it('rechaza lo que no hay', async () => {
    const product = await seedProduct({ stock: 1 });
    const res = await request(app)
      .post('/api/marketplace/checkout')
      .set(buyerH)
      .send({ items: [{ productId: product._id, qty: 2 }], shippingAddress: address })
      .expect(409);
    expect(res.body.error).toBe('out_of_stock');
  });

  it('frena un pedido por encima del tope', async () => {
    const product = await seedProduct({ priceEur: 1000, stock: 20 });
    const res = await request(app)
      .post('/api/marketplace/checkout')
      .set(buyerH)
      .send({ items: [{ productId: product._id, qty: 2 }], shippingAddress: address })
      .expect(400);
    expect(res.body.error).toBe('order_too_large');
    expect(res.body.max).toBe(ORDER_MAX_EUR);
  });

  it('crea el pedido con los totales congelados y el envío del vendedor', async () => {
    const product = await seedProduct({ priceEur: 20, stock: 10 });
    const res = await request(app)
      .post('/api/marketplace/checkout')
      .set(buyerH)
      .send({ items: [{ productId: product._id, qty: 1 }], shippingAddress: address })
      .expect(503); // sin Stripe: el pedido queda creado y a la espera

    expect(res.body.error).toBe('payments_unavailable');
    const order: any = await Order.findById(res.body.orderId).lean();
    expect(order.subtotalEur).toBe(20);
    expect(order.shippingEur).toBe(3.5); // por debajo del umbral de 40 €
    expect(order.totalEur).toBe(23.5);
    expect(order.commissionEur).toBe(1.6); // 8% de 20
    expect(order.status).toBe('pending_payment');
    expect(order.items[0].name).toBe('Pienso cachorro 3kg');
  });

  it('deja comprar sin cuenta y devuelve el token que da acceso al pedido', async () => {
    const product = await seedProduct();
    const res = await request(app)
      .post('/api/marketplace/checkout')
      .send({
        items: [{ productId: product._id, qty: 1 }],
        email: 'invitada@test.com',
        name: 'Invitada',
        shippingAddress: address,
      })
      .expect(503);

    expect(res.body.guestToken).toBeTruthy();
    const order: any = await Order.findById(res.body.orderId).select('+guestToken').lean();
    expect(order.buyer.userId).toBeUndefined();
    expect(order.buyer.email).toBe('invitada@test.com');
    expect(order.guestToken).toBe(res.body.guestToken);
  });

  it('exige email al invitado', async () => {
    const product = await seedProduct();
    const res = await request(app)
      .post('/api/marketplace/checkout')
      .send({ items: [{ productId: product._id, qty: 1 }], name: 'Invitada', shippingAddress: address })
      .expect(400);
    expect(res.body.error).toBe('email_required');
  });
});

// ----------------------------------------------------------------- pedidos

async function seedPendingOrder(overrides: Record<string, any> = {}) {
  const product = await seedProduct({ stock: 5 });
  const order = await Order.create({
    reference: 'MP-TEST-0002',
    listedBy: 'partner',
    sellerId: storeId,
    buyer: { userId: buyerId, email: 'ana@test.com', name: 'Ana' },
    items: [{ productId: product._id, name: product.name, priceEur: 20, qty: 2 }],
    shippingAddress: { ...address, country: 'ES' },
    subtotalEur: 40,
    shippingEur: 0,
    totalEur: 40,
    commissionPct: 8,
    commissionEur: 3.2,
    ...overrides,
  });
  return { product, order };
}

describe('Pago confirmado', () => {
  it('descuenta el stock una sola vez aunque el webhook se repita', async () => {
    const { product, order } = await seedPendingOrder();

    expect(await fulfillPaidOrder(String(order._id), 'pi_1')).toBe(true);
    // Stripe reintenta: la segunda pasada no puede volver a descontar.
    expect(await fulfillPaidOrder(String(order._id), 'pi_1')).toBe(false);

    const after: any = await Product.findById(product._id).lean();
    expect(after.stock).toBe(3);

    const paid: any = await Order.findById(order._id).lean();
    expect(paid.status).toBe('paid');
    expect(paid.paymentRef).toBe('pi_1');
    expect(paid.paidAt).toBeTruthy();
  });

  it('ignora un pedido que no está esperando pago', async () => {
    const { order } = await seedPendingOrder({ status: 'cancelled' });
    expect(await fulfillPaidOrder(String(order._id), 'pi_2')).toBe(false);
  });
});

describe('Acceso al pedido', () => {
  it('deja entrar al comprador y al vendedor, y a nadie más', async () => {
    const { order } = await seedPendingOrder();
    const url = `/api/marketplace/orders/${order._id}`;

    await request(app).get(url).set(buyerH).expect(200);
    await request(app).get(url).set(storeH).expect(200);
    await request(app).get(url).set(adminH).expect(200);
    await request(app).get(url).set(otherH).expect(403);
    await request(app).get(url).expect(403);
  });

  it('abre el pedido del invitado solo con su token, y nunca lo devuelve', async () => {
    const product = await seedProduct();
    const created = await request(app)
      .post('/api/marketplace/checkout')
      .send({
        items: [{ productId: product._id, qty: 1 }],
        email: 'invitada@test.com',
        name: 'Invitada',
        shippingAddress: address,
      })
      .expect(503);

    const url = `/api/marketplace/orders/${created.body.orderId}`;
    await request(app).get(url).expect(403);
    await request(app).get(`${url}?token=noesmitoken`).expect(403);

    const ok = await request(app).get(`${url}?token=${created.body.guestToken}`).expect(200);
    expect(ok.body.guestToken).toBeUndefined();
    expect(ok.body.reference).toBeTruthy();
  });

  it('el panel de la tienda no lista pedidos sin pagar', async () => {
    await seedPendingOrder();
    const pending = await request(app).get('/api/marketplace/seller/orders').set(storeH).expect(200);
    expect(pending.body.items).toHaveLength(0);

    const { order } = await seedPendingOrder({ reference: 'MP-TEST-0003', status: 'paid' });
    const paid = await request(app).get('/api/marketplace/seller/orders').set(storeH).expect(200);
    expect(paid.body.items.map((o: any) => String(o._id))).toEqual([String(order._id)]);
  });
});

describe('Envío', () => {
  it('solo se puede enviar lo que está pagado', async () => {
    const { order } = await seedPendingOrder();
    const res = await request(app)
      .post(`/api/marketplace/orders/${order._id}/ship`)
      .set(storeH)
      .send({ carrier: 'Correos', code: 'ES123' })
      .expect(409);
    expect(res.body.error).toBe('not_payable_state');
  });

  it('la tienda marca el envío y deja el seguimiento', async () => {
    const { order } = await seedPendingOrder({ status: 'paid' });
    const res = await request(app)
      .post(`/api/marketplace/orders/${order._id}/ship`)
      .set(storeH)
      .send({ carrier: 'Correos', code: 'ES123' })
      .expect(200);

    expect(res.body.status).toBe('shipped');
    expect(res.body.tracking.code).toBe('ES123');
    expect(res.body.tracking.shippedAt).toBeTruthy();
  });

  it('otra tienda no puede tocar el envío', async () => {
    const { order } = await seedPendingOrder({ status: 'paid' });
    await request(app)
      .post(`/api/marketplace/orders/${order._id}/ship`)
      .set(store2H)
      .send({})
      .expect(403);
  });
});
