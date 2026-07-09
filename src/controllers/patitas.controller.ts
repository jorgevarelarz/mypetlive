import { Request, Response } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { User } from '../models/user.model';
import { PatitaTxn } from '../models/patitaTxn.model';
import {
  PATITA_VALUE_EUR,
  VISIT_PATITAS_REWARD,
  eurFromPatitas,
  centsFromPatitas,
  genRedeemCode,
  signWalletToken,
  verifyWalletToken,
  signUserToken,
  verifyUserToken,
  transferPatitas,
  earnForUser,
} from '../utils/patitas';
import { isStripeConfigured, getStripeClient } from '../utils/stripe';
import getRequestLogger from '../utils/requestLogger';
import { Sale } from '../models/sale.model';
import { UserCode } from '../models/userCode.model';
import { recordSale, recordIdentification } from '../utils/sales';
import { eligibleCoupons, serializeCoupon } from '../utils/coupons';
import { canReceiveDonations } from '../utils/shelterVerification';

const objectIdRegex = /^[a-f\d]{24}$/i;

function normalizeId(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (!objectIdRegex.test(String(value))) return undefined;
  return String(value);
}

function actorId(req: Request): string {
  const user: any = (req as any).user;
  return String(user?._id || user?.id || '');
}

// --- Rate-limit en memoria para check-in de visita (1 por usuario+partner / ventana) ---
const VISIT_WINDOW_MS = 12 * 60 * 60 * 1000; // 12h
const visitStore = new Map<string, number>();

// --- Códigos cortos de wallet (fallback manual del QR) con TTL ---
const WALLET_CODE_TTL_MS = 10 * 60 * 1000;
const walletCodeStore = new Map<string, { shelterId: string; expiresAt: number }>();
function shortCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

export async function listProtectoras(_req: Request, res: Response) {
  const items = await User.find({ role: { $in: ['landlord', 'protectora'] } })
    .select('name')
    .sort({ name: 1 })
    .lean();
  const verified = await Promise.all(items.map(async item => (await canReceiveDonations(String(item._id))) ? item : null));
  return res.json({
    items: verified.filter(Boolean).map((item: any) => ({ id: String(item._id), name: item.name || 'Protectora sin nombre' })),
  });
}

// Saldo de una protectora (usado por el dashboard de protectora).
export async function getPatitasBalance(req: Request, res: Response) {
  const { shelterId } = req.query as { shelterId?: string };
  const user: any = (req as any).user;
  const explicitId = normalizeId(shelterId);
  let targetId: string | undefined = explicitId;
  if (!targetId && user?.role === 'landlord') targetId = String(user._id || user.id);

  if (targetId) {
    const protectora = await User.findOne({ _id: targetId, role: 'landlord' }).select('patitas role');
    if (!protectora) return res.status(404).json({ error: 'protectora_not_found' });
    return res.json({ patitas: protectora.patitas || 0, protectoraId: protectora.id });
  }
  const anyProtectora = await User.findOne({ role: 'landlord' }).select('patitas role');
  if (!anyProtectora) return res.json({ patitas: 0 });
  return res.json({ patitas: anyProtectora.patitas || 0, protectoraId: anyProtectora.id });
}

// Serializa una txn del ledger con nombres de las partes para el histórico/auditoría.
function serializeTxn(t: any) {
  const ref = (v: any) => (v && v._id ? { id: String(v._id), name: v.name, role: v.role } : v ? { id: String(v) } : undefined);
  return {
    id: String(t._id),
    type: t.type,
    amount: t.amount,
    valueEur: t.valueEur,
    source: t.source,
    status: t.status,
    code: t.code,
    concept: t.concept,
    user: ref(t.userId),
    shelter: ref(t.shelterId),
    partner: ref(t.partnerId),
    createdAt: t.createdAt,
  };
}

async function fetchHistory(meId: string, opts: { limit?: number; type?: string } = {}) {
  const limit = Math.min(100, Math.max(1, opts.limit || 30));
  const filter: any = { $or: [{ userId: meId }, { shelterId: meId }, { partnerId: meId }] };
  if (opts.type) filter.type = opts.type;
  const txns = await PatitaTxn.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'name role')
    .populate('shelterId', 'name')
    .populate('partnerId', 'name role')
    .lean();
  return txns.map(serializeTxn);
}

// Saldo + valor € + histórico reciente del usuario o protectora autenticado.
export async function getMyPatitas(req: Request, res: Response) {
  const me = actorId(req);
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  const user = await User.findById(me).select('patitas role profile.autoDonate').lean();
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  const balance = (user as any).patitas || 0;

  // Total histórico generado (solo para usuarios).
  const earnedAgg = await PatitaTxn.aggregate([
    { $match: { userId: new Types.ObjectId(me), type: 'earn' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).catch(() => []);
  const totalGenerated = earnedAgg?.[0]?.total || 0;

  res.json({
    balance,
    valueEur: eurFromPatitas(balance),
    patitaValueEur: PATITA_VALUE_EUR,
    totalGenerated,
    autoDonate: (user as any).profile?.autoDonate || { enabled: false },
    history: await fetchHistory(me, { limit: 30 }),
  });
}

export async function getMyPatitasHistory(req: Request, res: Response) {
  const me = actorId(req);
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  const { type, limit } = req.query as any;
  res.json({ items: await fetchHistory(me, { type: type ? String(type) : undefined, limit: Number(limit) || 50 }) });
}

// Donación manual de Patitas de un usuario a una protectora.
export async function donatePatitas(req: Request, res: Response) {
  const me = actorId(req);
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  const { shelterId, amount } = (req.body || {}) as { shelterId?: string; amount?: number };
  const target = normalizeId(shelterId);
  const n = Math.round(Number(amount));
  if (!target) return res.status(400).json({ error: 'invalid_shelter' });
  if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'invalid_amount' });

  const shelter = await User.findOne({ _id: target, role: { $in: ['landlord', 'protectora'] } }).select('name');
  if (!shelter) return res.status(404).json({ error: 'protectora_not_found' });
  if (!(await canReceiveDonations(target))) return res.status(403).json({ error: 'shelter_verification_required' });

  const moved = await transferPatitas(me, target, n);
  if (!moved) return res.status(400).json({ error: 'insufficient_patitas' });
  await PatitaTxn.create({ type: 'donate', userId: me, shelterId: target, amount: n, concept: 'Donación de Patitas' });
  res.json({ ok: true, balance: moved.fromBalance, shelterName: shelter.name });
}

// --- Identidad del usuario para ganar Patitas (QR que muestra el cliente) ---
const USER_CODE_TTL_MS = 10 * 60 * 1000;

// El usuario obtiene su token + código de identidad para mostrarlo en la tienda.
// El código se persiste en Mongo (TTL): sobrevive reinicios y varias instancias.
export async function getMyCode(req: Request, res: Response) {
  const me = actorId(req);
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  const token = signUserToken(me);
  const expiresAt = new Date(Date.now() + USER_CODE_TTL_MS);
  let code = shortCode();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await UserCode.create({ code, userId: me, expiresAt });
      break;
    } catch (err: any) {
      // Colisión del código (índice único): probar con otro.
      if (err?.code === 11000 && attempt < 2) { code = shortCode(); continue; }
      throw err;
    }
  }
  res.json({ token, code });
}

// Resuelve el usuario desde el QR (userToken), el código corto o el userId directo.
// Exportada: el TPV (pos.controller) usa la misma resolución, pero con
// allowUserId:false — la API de caja exige prueba de presencia (QR o código),
// nunca un userId arbitrario (evita minar usuarios y ventas sin cliente).
export async function resolveUserFromBody(
  body: any,
  opts: { allowUserId?: boolean } = {},
): Promise<string | null> {
  const { allowUserId = true } = opts;
  if (body?.userToken) {
    const decoded = verifyUserToken(String(body.userToken));
    if (decoded) return decoded.userId;
  }
  if (body?.code) {
    const entry = await UserCode.findOne({
      code: String(body.code).trim().toUpperCase(),
      expiresAt: { $gt: new Date() },
    }).lean();
    if (entry) return String(entry.userId);
  }
  if (allowUserId && body?.userId && objectIdRegex.test(String(body.userId))) return String(body.userId);
  return null;
}

// El partner identifica a un cliente por su QR/código antes de generarle Patitas.
export async function identifyUser(req: Request, res: Response) {
  const partner: any = (req as any).user;
  if (!['store', 'vet', 'admin'].includes(partner?.role)) return res.status(403).json({ error: 'forbidden' });
  const userId = await resolveUserFromBody(req.body || {});
  if (!userId) return res.status(400).json({ error: 'invalid_user_code' });
  const user = await User.findById(userId).select('name email role');
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  // Persistir la identificación: si no acaba enlazada a una venta, es una
  // venta probablemente no declarada (informe de fugas de comisión).
  await recordIdentification(actorId(req), String(user._id));
  // Cupones elegibles de ESTE cliente en este establecimiento: la caja los ve
  // nada más identificar (mismo dato que da el TPV en /api/pos/identify).
  const coupons = await eligibleCoupons(actorId(req), String(user._id));
  res.json({
    userId: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    coupons: coupons.map(serializeCoupon),
  });
}

// POST /api/patitas/sales — el partner registra una venta con el código del cliente:
// importe del ticket + líneas opcionales (producto/cantidad/precio). Deja calculada
// la comisión de plataforma y da al cliente Patitas proporcionales al importe.
export async function registerSale(req: Request, res: Response) {
  const partner: any = (req as any).user;
  const partnerId = actorId(req);
  if (!['store', 'vet', 'admin'].includes(partner?.role)) return res.status(403).json({ error: 'forbidden' });

  const target = await resolveUserFromBody(req.body || {});
  if (!target) return res.status(400).json({ error: 'invalid_user' });
  const user = await User.findById(target).select('role');
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  const amountEur = Number(req.body?.amountEur);
  if (!Number.isFinite(amountEur) || amountEur <= 0 || amountEur > 100000) {
    return res.status(400).json({ error: 'invalid_amount' });
  }

  const partnerDoc: any = await User.findById(partnerId).select('name role profile.orgName profile.commissionPct').lean();
  const r = await recordSale(partnerDoc, target, amountEur, req.body?.items);

  res.status(201).json({
    ok: true, saleId: r.saleId, commissionPct: r.commissionPct, commissionEur: r.commissionEur, patitasEarned: r.patitasEarned,
    ...(r.earn ? { balance: r.earn.balance, autoDonated: r.earn.autoDonated } : {}),
  });
}

// GET /api/patitas/sales/mine — ventas registradas por el partner autenticado.
export async function listMySales(req: Request, res: Response) {
  const partnerId = actorId(req);
  const items = await Sale.find({ partnerId })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('userId', 'name')
    .lean();
  const totals = items.reduce(
    (acc, s: any) => ({ amountEur: acc.amountEur + (s.amountEur || 0), commissionEur: acc.commissionEur + (s.commissionEur || 0) }),
    { amountEur: 0, commissionEur: 0 },
  );
  res.json({ items, totals: { ...totals, count: items.length } });
}

// Check-in de visita a tienda: el partner identifica a un usuario y le genera Patitas.
export async function earnVisit(req: Request, res: Response) {
  const partnerId = actorId(req);
  const partner: any = (req as any).user;
  if (!['store', 'vet', 'admin'].includes(partner?.role)) return res.status(403).json({ error: 'forbidden' });
  const target = await resolveUserFromBody(req.body || {});
  if (!target) return res.status(400).json({ error: 'invalid_user' });

  const user = await User.findById(target).select('role');
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  const key = `${target}:${partnerId}`;
  const last = visitStore.get(key) || 0;
  if (Date.now() - last < VISIT_WINDOW_MS) {
    return res.status(429).json({ error: 'visit_already_rewarded' });
  }
  visitStore.set(key, Date.now());

  const result = await earnForUser({
    userId: target,
    amount: VISIT_PATITAS_REWARD,
    source: 'visit',
    partnerId,
    concept: 'Visita a tienda',
  });
  res.json({ ok: true, ...result });
}

// Token + código corto de la wallet de la protectora (para QR de canje y fallback manual).
export async function getWalletToken(req: Request, res: Response) {
  const me = actorId(req);
  const user: any = (req as any).user;
  // Protectoras reales usan role 'protectora'; 'landlord' es el rol legado de
  // RentalApp que las protectoras antiguas aún conservan.
  if (!['landlord', 'protectora'].includes(user?.role)) return res.status(403).json({ error: 'only_shelters' });
  const shelter = await User.findById(me).select('patitas');
  const token = signWalletToken(me);
  const code = shortCode();
  walletCodeStore.set(code, { shelterId: me, expiresAt: Date.now() + WALLET_CODE_TTL_MS });
  res.json({ token, code, balance: shelter?.patitas || 0, valueEur: eurFromPatitas(shelter?.patitas || 0) });
}

function resolveShelterFromBody(body: any): string | null {
  if (body?.walletToken) {
    const decoded = verifyWalletToken(String(body.walletToken));
    if (decoded) return decoded.shelterId;
  }
  if (body?.code) {
    const entry = walletCodeStore.get(String(body.code).trim().toUpperCase());
    if (entry && entry.expiresAt > Date.now()) return entry.shelterId;
  }
  return null;
}

// Previsualización del canje: el partner ve protectora, Patitas disponibles y € a recibir.
export async function redeemPreview(req: Request, res: Response) {
  const partner: any = (req as any).user;
  if (!['store', 'vet'].includes(partner?.role)) return res.status(403).json({ error: 'forbidden' });
  const shelterId = resolveShelterFromBody(req.body || {});
  if (!shelterId) return res.status(400).json({ error: 'invalid_wallet' });

  const shelter = await User.findById(shelterId).select('name patitas role');
  if (!shelter || !['landlord', 'protectora'].includes(String(shelter.role))) {
    return res.status(404).json({ error: 'protectora_not_found' });
  }
  const available = shelter.patitas || 0;
  const rawAmount = (req.body || {}).amount;
  const amount = rawAmount === 'all' || rawAmount == null ? available : Math.round(Number(rawAmount));
  res.json({
    shelter: { id: String(shelter._id), name: shelter.name },
    available,
    amount: Number.isFinite(amount) ? amount : 0,
    valueEur: eurFromPatitas(Number.isFinite(amount) ? amount : 0),
    patitaValueEur: PATITA_VALUE_EUR,
  });
}

// Confirmación del canje: descuenta Patitas de la protectora y dispara el pago real al partner.
export async function redeemConfirm(req: Request, res: Response) {
  const partner: any = (req as any).user;
  const partnerId = actorId(req);
  if (!['store', 'vet'].includes(partner?.role)) return res.status(403).json({ error: 'forbidden' });

  const shelterId = resolveShelterFromBody(req.body || {});
  if (!shelterId) return res.status(400).json({ error: 'invalid_wallet' });

  const shelter = await User.findById(shelterId).select('name patitas role');
  if (!shelter || !['landlord', 'protectora'].includes(String(shelter.role))) {
    return res.status(404).json({ error: 'protectora_not_found' });
  }

  const rawAmount = (req.body || {}).amount;
  const amount = rawAmount === 'all' ? shelter.patitas || 0 : Math.round(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'invalid_amount' });

  // Débito atómico de la protectora (solo si tiene saldo suficiente).
  const debited = await User.findOneAndUpdate(
    { _id: shelterId, patitas: { $gte: amount } },
    { $inc: { patitas: -amount } },
    { new: true },
  ).select('patitas');
  if (!debited) return res.status(400).json({ error: 'insufficient_patitas', available: shelter.patitas || 0 });

  const valueEur = eurFromPatitas(amount);
  const code = genRedeemCode();
  const txn = await PatitaTxn.create({
    type: 'redeem',
    shelterId,
    partnerId,
    amount,
    valueEur,
    code,
    status: 'pending_payout',
    concept: `Canje en ${partner.role === 'vet' ? 'veterinario' : 'tienda'}`,
  });

  // Pago real al partner (modelo RSC: lo financia la plataforma). Gateado por Stripe.
  let payoutStatus: string = 'pending_payout';
  const partnerDoc = await User.findById(partnerId).select('stripeAccountId');
  if (isStripeConfigured() && partnerDoc?.stripeAccountId) {
    try {
      const stripe = getStripeClient();
      const transfer = await stripe.transfers.create({
        amount: centsFromPatitas(amount),
        currency: 'eur',
        destination: partnerDoc.stripeAccountId,
        metadata: { code, shelterId, partnerId, patitas: String(amount) },
      });
      txn.status = 'paid';
      txn.payoutRef = transfer.id;
      await txn.save();
      payoutStatus = 'paid';
    } catch (err) {
      getRequestLogger(req).error({ err, code }, 'Error en transfer de canje de Patitas');
      payoutStatus = 'pending_payout';
    }
  }

  res.json({
    ok: true,
    code,
    patitas: amount,
    valueEur,
    payoutStatus,
    shelter: { id: String(shelter._id), name: shelter.name },
    newShelterBalance: debited.patitas || 0,
  });
}

// Alta manual de Patitas a una protectora (solo admin).
export async function addPatitas(req: Request, res: Response) {
  const { id } = req.params;
  const amount = Number((req.body as any)?.amount);
  if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid_protectora_id' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'invalid_amount' });

  const updated = await User.findOneAndUpdate(
    { _id: id, role: 'landlord' },
    { $inc: { patitas: amount } },
    { new: true },
  ).select('patitas role');
  if (!updated) return res.status(404).json({ error: 'protectora_not_found' });
  await PatitaTxn.create({ type: 'donate', shelterId: id, amount: Math.round(amount), source: 'manual', concept: 'Ajuste manual (admin)' });
  return res.json({ patitas: updated.patitas || 0, protectoraId: updated.id });
}
