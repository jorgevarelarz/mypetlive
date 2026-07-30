import { Request, Response } from 'express';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { Product, PRODUCT_CATEGORIES } from '../models/product.model';
import { Order, buildOrderReference } from '../models/order.model';
import { User } from '../models/user.model';
import { isStripeConfigured, getStripeClient } from '../utils/stripe';
import {
  MARKETPLACE_COMMISSION_PCT,
  ORDER_MAX_EUR,
  cents,
  orderTotals,
  shippingFor,
  priceFromCost,
  type ListedBy,
} from '../utils/marketplace';
import { normalizeSpecies, speciesVariants } from '../utils/species';
import { sendEmail } from '../utils/notification';
import logger from '../utils/logger';

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'https://mypetlive.es';

/** Lo que ve cualquiera: nunca el coste de proveedor, que es información nuestra. */
function publicProduct(doc: any, seller?: any) {
  return {
    id: String(doc._id),
    name: doc.name,
    description: doc.description,
    images: doc.images || [],
    category: doc.category,
    species: doc.species || [],
    priceEur: doc.priceEur,
    stock: doc.stock,
    listedBy: doc.listedBy,
    seller: seller ? { id: String(seller._id), name: seller.name, city: seller.profile?.address?.city } : null,
  };
}

// ---------------------------------------------------------------- catálogo

export async function listProducts(req: Request, res: Response) {
  const { q, category, species, seller } = req.query as Record<string, string>;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 24));

  const filter: any = { active: true, stock: { $gt: 0 } };
  if (category && PRODUCT_CATEGORIES.includes(category as any)) filter.category = category;
  if (seller && Types.ObjectId.isValid(seller)) filter.sellerId = seller;
  if (species) {
    // Vacío = vale para todas las especies, así que no puede quedar fuera. Se
    // casa contra las variantes (cat/gato) porque el alta histórica mezcla
    // idiomas y filtrar solo por la forma canónica esconde productos válidos.
    const variants = speciesVariants(species);
    if (variants.length) filter.$or = [{ species: { $size: 0 } }, { species: { $in: variants } }];
  }
  if (q && q.trim()) {
    // Búsqueda por subcadena y no `$text`: con catálogos pequeños es más
    // predecible y casa "acana" con "Acana Adult" sin depender del idioma del índice.
    const safe = q.trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.name = { $regex: safe, $options: 'i' };
  }

  const [items, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  const sellerIds = items.map(p => p.sellerId).filter(Boolean);
  const sellers = sellerIds.length
    ? await User.find({ _id: { $in: sellerIds } }).select('name profile.address.city').lean()
    : [];
  const byId = new Map(sellers.map((s: any) => [String(s._id), s]));

  res.json({
    items: items.map(p => publicProduct(p, p.sellerId ? byId.get(String(p.sellerId)) : undefined)),
    page,
    limit,
    total,
  });
}

export async function getProduct(req: Request, res: Response) {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'not_found' });
  const product = await Product.findOne({ _id: id, active: true }).lean();
  if (!product) return res.status(404).json({ error: 'not_found' });

  const seller = product.sellerId ? await User.findById(product.sellerId).select('name profile').lean() : null;
  const subtotal = product.priceEur;
  const shippingEur = shippingFor(subtotal, {
    shippingEur: (seller as any)?.profile?.marketplace?.shippingEur,
    freeFromEur: (seller as any)?.profile?.marketplace?.freeFromEur,
  });

  res.json({ ...publicProduct(product, seller), shippingEur });
}

// ------------------------------------------------------- alta de productos

/** Quién puede tocar este producto: su tienda, o un admin (que además lleva los nuestros). */
function canManage(product: any, user: any): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return !!product.sellerId && String(product.sellerId) === String(user._id || user.id);
}

export async function myProducts(req: Request, res: Response) {
  const user: any = (req as any).user;
  const filter = user.role === 'admin' ? {} : { sellerId: user._id || user.id };
  const items = await Product.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ items });
}

export async function upsertProduct(req: Request, res: Response) {
  const user: any = (req as any).user;
  const body = (req.body || {}) as Record<string, any>;
  const isAdmin = user.role === 'admin';

  // Un admin puede listar en nombre de la plataforma; una tienda, solo lo suyo.
  const listedBy: ListedBy = isAdmin && body.listedBy === 'platform' ? 'platform' : 'partner';
  if (listedBy === 'partner' && !isAdmin && user.role !== 'store') {
    return res.status(403).json({ error: 'not_a_store' });
  }

  const name = String(body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name_required' });

  const costEur = body.costEur === undefined || body.costEur === '' ? undefined : Number(body.costEur);
  let priceEur = body.priceEur === undefined || body.priceEur === '' ? undefined : Number(body.priceEur);
  // Producto nuestro con coste y sin precio: se aplica el sobrecoste por defecto
  // en vez de rechazar el alta.
  if (priceEur === undefined && listedBy === 'platform' && Number.isFinite(costEur as number)) {
    priceEur = priceFromCost(costEur as number);
  }
  if (!Number.isFinite(priceEur as number) || (priceEur as number) < 0.5) {
    return res.status(400).json({ error: 'invalid_price' });
  }
  if (listedBy === 'platform' && Number.isFinite(costEur as number) && (costEur as number) > (priceEur as number)) {
    // Vender por debajo del coste es siempre un dedazo, nunca una decisión.
    return res.status(400).json({ error: 'price_below_cost', costEur, priceEur });
  }

  const payload: any = {
    listedBy,
    name,
    description: String(body.description || '').trim().slice(0, 2000) || undefined,
    images: Array.isArray(body.images) ? body.images.slice(0, 6).map((i: any) => String(i)) : [],
    category: PRODUCT_CATEGORIES.includes(body.category) ? body.category : 'otros',
    // `normalizeSpecies` devuelve undefined con entrada vacía: sin el filtro se
    // guardaría un array con huecos que después no casa con nada.
    species: Array.isArray(body.species)
      ? (body.species.map((s: any) => normalizeSpecies(String(s))).filter(Boolean) as string[])
      : [],
    priceEur,
    stock: Math.max(0, Math.floor(Number(body.stock) || 0)),
    active: body.active === undefined ? true : !!body.active,
  };
  if (listedBy === 'platform') payload.costEur = Number.isFinite(costEur as number) ? costEur : undefined;
  else payload.sellerId = isAdmin && body.sellerId ? body.sellerId : user._id || user.id;

  if (body.id && Types.ObjectId.isValid(body.id)) {
    const existing = await Product.findById(body.id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (!canManage(existing, user)) return res.status(403).json({ error: 'forbidden' });
    // El modo no se cambia sobre la marcha: quien vende no puede mutar bajo los
    // pies de un pedido en curso.
    delete payload.listedBy;
    delete payload.sellerId;
    Object.assign(existing, payload);
    await existing.save();
    return res.json({ ok: true, product: existing });
  }

  const created = await Product.create(payload);
  res.status(201).json({ ok: true, product: created });
}

export async function deleteProduct(req: Request, res: Response) {
  const user: any = (req as any).user;
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'not_found' });
  const product = await Product.findById(id);
  if (!product) return res.status(404).json({ error: 'not_found' });
  if (!canManage(product, user)) return res.status(403).json({ error: 'forbidden' });

  // Si ya se ha vendido no se borra, se retira: los pedidos antiguos siguen
  // apuntando a este producto y un hueco en la base convierte un pedido en un
  // misterio.
  const sold = await Order.countDocuments({ 'items.productId': product._id });
  if (sold > 0) {
    product.active = false;
    await product.save();
    return res.json({ ok: true, retired: true });
  }
  await product.deleteOne();
  res.json({ ok: true, deleted: true });
}

// -------------------------------------------------------------- checkout

function cleanText(value: unknown, max: number): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Crea el pedido y la sesión de pago.
 *
 * Se puede comprar **sin cuenta**: lo único imprescindible es un email al que
 * mandar el pedido y una dirección a la que enviarlo. A cambio, el invitado
 * recibe un `guestToken` que es lo único que le da acceso después.
 */
export async function createCheckout(req: Request, res: Response) {
  const user: any = (req as any).user;
  const body = (req.body || {}) as Record<string, any>;

  const rawItems: Array<{ productId: string; qty: number }> = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) return res.status(400).json({ error: 'empty_cart' });
  if (rawItems.length > 20) return res.status(400).json({ error: 'too_many_items' });

  // El token solo lleva id y rol, así que el email y el nombre de un usuario con
  // sesión hay que ir a buscarlos: pedírselos otra vez a quien ya tiene cuenta
  // sería absurdo, y fiarse de lo que manda el cliente permitiría poner el
  // pedido de otro a nombre propio.
  const account = user?._id || user?.id ? await User.findById(user._id || user.id).select('name email').lean() : null;

  const email = cleanText(account?.email || body.email, 160).toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'email_required' });
  const buyerName = cleanText(account?.name || body.name, 120);
  if (!buyerName) return res.status(400).json({ error: 'name_required' });

  const address = (body.shippingAddress || {}) as Record<string, any>;
  const shippingAddress = {
    line1: cleanText(address.line1, 160),
    line2: cleanText(address.line2, 160) || undefined,
    city: cleanText(address.city, 80),
    postalCode: cleanText(address.postalCode, 12),
    province: cleanText(address.province, 80) || undefined,
    country: (cleanText(address.country, 2) || 'ES').toUpperCase(),
  };
  if (!shippingAddress.line1 || !shippingAddress.city || !shippingAddress.postalCode) {
    return res.status(400).json({ error: 'address_incomplete' });
  }

  // Se agrupan las líneas repetidas antes de mirar nada: pedir dos veces el
  // mismo producto es "quiero dos", y comprobar el stock línea a línea dejaría
  // pasar 2×8 unidades de un producto con 10 en almacén… y con 8.
  const qtyById = new Map<string, number>();
  for (const raw of rawItems) {
    const id = String(raw?.productId || '');
    if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'product_unavailable' });
    const qty = Math.floor(Number(raw?.qty) || 1);
    qtyById.set(id, (qtyById.get(id) || 0) + Math.max(1, qty));
  }

  const products = await Product.find({ _id: { $in: [...qtyById.keys()] }, active: true });
  if (products.length !== qtyById.size) return res.status(400).json({ error: 'product_unavailable' });

  // Un pedido, un vendedor: con envío, dos tiendas son dos paquetes y dos
  // responsables. Mezclarlos solo sirve para que nadie sepa a quién reclamar.
  const sellerKey = (p: any) => `${p.listedBy}:${p.sellerId || 'platform'}`;
  const keys = new Set(products.map(sellerKey));
  if (keys.size > 1) return res.status(400).json({ error: 'mixed_sellers' });

  const first: any = products[0];
  const listedBy: ListedBy = first.listedBy;
  const sellerId = first.sellerId ? String(first.sellerId) : undefined;

  const lines = [];
  for (const product of products as any[]) {
    const qty = Math.min(20, qtyById.get(String(product._id)) as number);
    if (product.stock < qty) {
      return res.status(409).json({ error: 'out_of_stock', productId: String(product._id), stock: product.stock });
    }
    lines.push({
      productId: product._id,
      name: product.name,
      priceEur: product.priceEur,
      qty,
      ...(product.costEur !== undefined ? { costEur: product.costEur } : {}),
    });
  }

  let seller: any = null;
  let commissionPct = MARKETPLACE_COMMISSION_PCT;
  if (listedBy === 'partner') {
    seller = await User.findById(sellerId).select('name email role profile stripeAccountId').lean();
    if (!seller) return res.status(400).json({ error: 'seller_unavailable' });
    if (typeof seller.profile?.commissionPct === 'number') commissionPct = seller.profile.commissionPct;

    // Vende la tienda: si el dinero no puede llegar a su cuenta, no se cobra.
    // Sin esto el pago entraría íntegro en la nuestra por una venta que no es
    // nuestra, y quedaríamos debiéndole el importe sin ningún rastro de cuánto.
    // Mismo criterio que las donaciones a protectoras (donations.routes.ts).
    if (isStripeConfigured()) {
      if (!seller.stripeAccountId) return res.status(409).json({ error: 'seller_payouts_not_ready' });
      try {
        const account = await getStripeClient().accounts.retrieve(seller.stripeAccountId);
        if (!account.charges_enabled) return res.status(409).json({ error: 'seller_payouts_not_ready' });
      } catch (err) {
        logger.error({ err, sellerId }, '[marketplace] no se pudo verificar la cuenta de la tienda');
        return res.status(409).json({ error: 'seller_payouts_not_ready' });
      }
    }
  }

  const subtotal = lines.reduce((acc, l) => acc + l.priceEur * l.qty, 0);
  const shippingEur = shippingFor(subtotal, {
    shippingEur: seller?.profile?.marketplace?.shippingEur,
    freeFromEur: seller?.profile?.marketplace?.freeFromEur,
  });
  const totals = orderTotals(lines, { listedBy, shippingEur, commissionPct });

  if (totals.totalEur > ORDER_MAX_EUR) {
    return res.status(400).json({ error: 'order_too_large', max: ORDER_MAX_EUR });
  }

  const guestToken = user?._id || user?.id ? undefined : crypto.randomBytes(24).toString('hex');

  const order = await Order.create({
    reference: buildOrderReference(),
    listedBy,
    ...(sellerId ? { sellerId } : {}),
    buyer: {
      ...(user?._id || user?.id ? { userId: user._id || user.id } : {}),
      email,
      name: buyerName,
      phone: cleanText(body.phone, 30) || undefined,
    },
    ...(guestToken ? { guestToken } : {}),
    items: lines,
    shippingAddress,
    subtotalEur: totals.subtotalEur,
    shippingEur: totals.shippingEur,
    totalEur: totals.totalEur,
    commissionPct: totals.commissionPct,
    commissionEur: totals.commissionEur,
    platformMarginEur: totals.platformMarginEur,
    status: 'pending_payment',
  });

  if (!isStripeConfigured()) {
    // Sin Stripe el pedido queda creado y a la espera: es preferible a fingir
    // que no ha pasado nada cuando alguien ya ha rellenado su dirección.
    return res.status(503).json({ error: 'payments_unavailable', orderId: String(order._id), guestToken });
  }

  try {
    const stripe = getStripeClient();
    const base = FRONTEND_URL();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [
        ...lines.map(l => ({
          quantity: l.qty,
          price_data: {
            currency: 'eur',
            unit_amount: cents(l.priceEur),
            product_data: { name: l.name },
          },
        })),
        ...(totals.shippingEur > 0
          ? [{
              quantity: 1,
              price_data: {
                currency: 'eur',
                unit_amount: cents(totals.shippingEur),
                product_data: { name: 'Gastos de envío' },
              },
            }]
          : []),
      ],
      // Producto de tienda: el dinero va a su cuenta y retenemos la comisión.
      // Producto nuestro: cobro normal, porque el vendedor somos nosotros.
      ...(listedBy === 'partner' && seller?.stripeAccountId
        ? {
            payment_intent_data: {
              application_fee_amount: cents(totals.commissionEur),
              transfer_data: { destination: seller.stripeAccountId },
            },
          }
        : {}),
      metadata: {
        marketplaceOrderId: String(order._id),
        reference: order.reference,
        listedBy,
      },
      success_url: `${base}/pedido/${order._id}?ok=1${guestToken ? `&token=${guestToken}` : ''}`,
      cancel_url: `${base}/pedido/${order._id}?cancelado=1${guestToken ? `&token=${guestToken}` : ''}`,
    });

    order.sessionId = session.id;
    await order.save();
    return res.json({ ok: true, orderId: String(order._id), reference: order.reference, url: session.url, guestToken });
  } catch (err: any) {
    logger.error({ err, orderId: String(order._id) }, '[marketplace] no se pudo crear la sesión de pago');
    return res.status(502).json({ error: 'checkout_failed', orderId: String(order._id) });
  }
}

// ---------------------------------------------------------------- pedidos

function canSeeOrder(order: any, user: any, token?: string): boolean {
  if (token && order.guestToken && token === order.guestToken) return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  const userId = String(user._id || user.id);
  if (order.buyer?.userId && String(order.buyer.userId) === userId) return true;
  return !!order.sellerId && String(order.sellerId) === userId;
}

export async function getOrder(req: Request, res: Response) {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'not_found' });
  const order = await Order.findById(id).select('+guestToken');
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (!canSeeOrder(order, (req as any).user, String(req.query.token || ''))) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const plain = order.toObject();
  delete (plain as any).guestToken;
  res.json(plain);
}

export async function myOrders(req: Request, res: Response) {
  const user: any = (req as any).user;
  const items = await Order.find({ 'buyer.userId': user._id || user.id }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ items });
}

export async function sellerOrders(req: Request, res: Response) {
  const user: any = (req as any).user;
  const filter = user.role === 'admin' ? { status: { $ne: 'pending_payment' } } : { sellerId: user._id || user.id, status: { $ne: 'pending_payment' } };
  const items = await Order.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ items });
}

/** La tienda marca el pedido como enviado y, si lo tiene, deja el seguimiento. */
export async function markShipped(req: Request, res: Response) {
  const user: any = (req as any).user;
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'not_found' });
  const order = await Order.findById(id);
  if (!order) return res.status(404).json({ error: 'not_found' });

  const isAdmin = user.role === 'admin';
  const isSeller = order.sellerId && String(order.sellerId) === String(user._id || user.id);
  if (!isAdmin && !isSeller) return res.status(403).json({ error: 'forbidden' });
  if (order.status !== 'paid') return res.status(409).json({ error: 'not_payable_state', status: order.status });

  order.status = 'shipped';
  order.tracking = {
    carrier: cleanText((req.body || {}).carrier, 60) || undefined,
    code: cleanText((req.body || {}).code, 80) || undefined,
    shippedAt: new Date(),
  };
  await order.save();

  try {
    const tracking = order.tracking?.code
      ? `\n\nSeguimiento: ${order.tracking.carrier || ''} ${order.tracking.code}`.trim()
      : '';
    await sendEmail(
      order.buyer.email,
      `Tu pedido ${order.reference} va de camino`,
      `Buenas noticias: tu pedido ya ha salido.${tracking}\n\n${FRONTEND_URL()}/pedido/${order._id}`,
    );
  } catch (err) {
    logger.error({ err, orderId: String(order._id) }, '[marketplace] no se pudo avisar del envío');
  }

  res.json({ ok: true, status: order.status, tracking: order.tracking });
}

/**
 * Marca el pedido como pagado y descuenta stock. La llama el webhook de Stripe.
 *
 * Idempotente: Stripe reintenta los webhooks, y descontar dos veces el stock
 * dejaría sin producto a alguien que sí lo tenía.
 */
export async function fulfillPaidOrder(orderId: string, paymentRef?: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(orderId)) return false;
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: 'pending_payment' },
    { status: 'paid', paidAt: new Date(), ...(paymentRef ? { paymentRef } : {}) },
    { new: true },
  );
  if (!order) return false;

  for (const item of order.items) {
    await Product.updateOne({ _id: item.productId }, { $inc: { stock: -item.qty } });
  }
  // Un stock negativo por una carrera es un dato roto: se corrige en el acto.
  await Product.updateMany({ stock: { $lt: 0 } }, { $set: { stock: 0 } });

  try {
    const lines = order.items.map(i => `- ${i.qty} × ${i.name}`).join('\n');
    await sendEmail(
      order.buyer.email,
      `Pedido ${order.reference} confirmado`,
      `Gracias por tu compra.\n\n${lines}\n\nTotal: ${order.totalEur.toFixed(2)} €\n` +
        `Se enviará a: ${order.shippingAddress.line1}, ${order.shippingAddress.postalCode} ${order.shippingAddress.city}\n\n` +
        `${FRONTEND_URL()}/pedido/${order._id}`,
    );
    if (order.sellerId) {
      const seller = await User.findById(order.sellerId).select('email').lean();
      if (seller?.email) {
        await sendEmail(
          seller.email,
          `Nuevo pedido ${order.reference}`,
          `Tienes un pedido que preparar:\n\n${lines}\n\nEnvío a: ${order.shippingAddress.line1}, ` +
            `${order.shippingAddress.postalCode} ${order.shippingAddress.city}\n\n${FRONTEND_URL()}/partner/pedidos`,
        );
      }
    }
  } catch (err) {
    logger.error({ err, orderId }, '[marketplace] pedido pagado pero sin avisar por email');
  }

  return true;
}
