import { Request, Response } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { User } from '../models/user.model';
import { PatitaTxn } from '../models/patitaTxn.model';
import { PatitaLog } from '../models/patitaLog.model';
import { Coupon } from '../models/coupon.model';
import {
  PATITA_VALUE_EUR,
  VISIT_PATITAS_REWARD,
  eurFromPatitas,
  centsFromPatitas,
  genRedeemCode,
  signWalletToken,
  verifyWalletToken,
  transferPatitas,
  earnForUser,
} from '../utils/patitas';
import { isStripeConfigured, getStripeClient } from '../utils/stripe';
import getRequestLogger from '../utils/requestLogger';

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
  return res.json({
    items: items.map(item => ({ id: String(item._id), name: item.name || 'Protectora sin nombre' })),
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

  const moved = await transferPatitas(me, target, n);
  if (!moved) return res.status(400).json({ error: 'insufficient_patitas' });
  await PatitaTxn.create({ type: 'donate', userId: me, shelterId: target, amount: n, concept: 'Donación de Patitas' });
  res.json({ ok: true, balance: moved.fromBalance, shelterName: shelter.name });
}

// Check-in de visita a tienda: el partner identifica a un usuario y le genera Patitas.
export async function earnVisit(req: Request, res: Response) {
  const partnerId = actorId(req);
  const partner: any = (req as any).user;
  if (!['store', 'vet', 'admin'].includes(partner?.role)) return res.status(403).json({ error: 'forbidden' });
  const { userId } = (req.body || {}) as { userId?: string };
  const target = normalizeId(userId);
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
  if (user?.role !== 'landlord') return res.status(403).json({ error: 'only_shelters' });
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

// ---------------------------------------------------------------------------
// "Dar Patita" social y gasto directo de la protectora (flujo legado, conservado
// para los botones de apoyo en las páginas de contenido). Acreditan/debitan el
// mismo saldo `User.patitas` y registran en el ledger antiguo `PatitaLog`.
// ---------------------------------------------------------------------------

const CLICK_LIMIT = 10;
const CLICK_WINDOW_MS = 60 * 60 * 1000;
const clickRateStore = new Map<string, { count: number; resetAt: number }>();

function consumeClickAllowance(userId: string) {
  const now = Date.now();
  const entry = clickRateStore.get(userId);
  if (!entry || entry.resetAt <= now) {
    clickRateStore.set(userId, { count: 1, resetAt: now + CLICK_WINDOW_MS });
    return { ok: true } as const;
  }
  if (entry.count >= CLICK_LIMIT) return { ok: false, retryAfterMs: entry.resetAt - now } as const;
  entry.count += 1;
  return { ok: true } as const;
}

export async function echoPatita(req: Request, res: Response) {
  const user: any = (req as any).user;
  const userId = user?._id || user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const { shelterId, animalId } = (req.body || {}) as { shelterId?: string; animalId?: string };
  const normalizedShelter = normalizeId(shelterId);
  if (!normalizedShelter) return res.status(400).json({ error: 'invalid_shelter_id' });

  const shelter = await User.findOne({ _id: normalizedShelter, role: 'landlord' }).select('patitas');
  if (!shelter) return res.status(404).json({ error: 'protectora_not_found' });

  const rate = consumeClickAllowance(String(userId));
  if (!rate.ok) {
    const retryAfter = rate.retryAfterMs ? Math.ceil(rate.retryAfterMs / 1000) : 3600;
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ error: 'patitas_rate_limited', retryAfter });
  }

  const updated = await User.findOneAndUpdate(
    { _id: normalizedShelter, role: 'landlord' },
    { $inc: { patitas: 1 } },
    { new: true },
  ).select('patitas');
  await PatitaLog.create({ shelterId: normalizedShelter, userId, animalId: normalizeId(animalId), amount: 1, source: 'click' });
  return res.json({ ok: true, newBalance: updated?.patitas ?? (shelter.patitas || 0) + 1 });
}

export async function spendPatitas(req: Request, res: Response) {
  const actor: any = (req as any).user;
  if (!actor) return res.status(401).json({ error: 'unauthorized' });
  const { amount, partnerType, concept, shelterId, animalId, couponId } = (req.body || {}) as any;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: 'invalid_amount' });
  if (!['store', 'vet'].includes(String(partnerType))) return res.status(400).json({ error: 'invalid_partner_type' });
  const trimmedConcept = (concept || '').trim();
  if (!trimmedConcept) return res.status(400).json({ error: 'concept_required' });

  let coupon: any;
  if (couponId) {
    if (!isValidObjectId(couponId)) return res.status(400).json({ error: 'invalid_coupon' });
    coupon = await Coupon.findById(couponId).lean();
    if (!coupon) return res.status(404).json({ error: 'coupon_not_found' });
    if (coupon.partnerType !== partnerType) return res.status(400).json({ error: 'coupon_partner_mismatch' });
  }

  const targetShelter = actor.role === 'landlord' ? String(actor._id || actor.id) : (actor.role === 'admin' ? normalizeId(shelterId) : undefined);
  if (!targetShelter) return res.status(400).json({ error: 'invalid_shelter_context' });

  const debited = await User.findOneAndUpdate(
    { _id: targetShelter, role: 'landlord', patitas: { $gte: numericAmount } },
    { $inc: { patitas: -numericAmount } },
    { new: true },
  ).select('patitas');
  if (!debited) return res.status(400).json({ error: 'insufficient_patitas' });

  await PatitaLog.create({
    shelterId: targetShelter,
    userId: String(actor._id || actor.id || targetShelter),
    animalId: normalizeId(animalId),
    amount: -numericAmount,
    source: partnerType,
    concept: trimmedConcept,
    couponId: coupon?._id,
  });
  return res.json({ ok: true, newBalance: debited.patitas ?? 0 });
}
