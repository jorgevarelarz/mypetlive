import { Request, Response } from 'express';
import { Types } from 'mongoose';
import crypto from 'crypto';
import { User } from '../models/user.model';
import { Coupon } from '../models/coupon.model';
import { Sale } from '../models/sale.model';
import { earnForUser, COUPON_PATITAS_REWARD_DEFAULT } from '../utils/patitas';
import { recordSale, recordIdentification, computeSaleFigures } from '../utils/sales';
import { eligibleCoupons, serializeCoupon } from '../utils/coupons';
import { withTxnIfAvailable } from '../utils/txn';
import { resolveUserFromBody } from './patitas.controller';

const MAX_POS_KEYS = 5;

function actorId(req: Request): string {
  const user: any = (req as any).user;
  return String(user?._id || user?.id || '');
}

function isTestMode(req: Request): boolean {
  return (req as any).posKeyMode === 'test';
}

// El TPV exige prueba de presencia del cliente (QR firmado o código corto de
// caja); nunca un userId arbitrario — evita minar usuarios y ventas fabricadas.
function resolvePresentUser(body: any) {
  return resolveUserFromBody(body || {}, { allowUserId: false });
}

// --- Gestión de claves del TPV (con sesión del partner) ---------------------

function newPosKey(mode: 'live' | 'test') {
  const key = `mpl_pos_${mode === 'test' ? 'test_' : ''}${crypto.randomBytes(24).toString('base64url')}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const prefix = key.slice(0, mode === 'test' ? 20 : 16);
  return { key, hash, prefix };
}

const serializeKey = (k: any) => ({
  id: String(k._id),
  label: k.label || 'TPV',
  mode: k.mode || 'live',
  prefix: k.prefix,
  lastUsedAt: k.lastUsedAt || null,
  createdAt: k.createdAt || null,
});

// GET /api/partners/me/pos-keys — lista de claves (nunca la clave en claro).
// La clave legado (posApiKeyHash) aparece como una entrada más con id 'legacy'.
export async function listPosKeys(req: Request, res: Response) {
  const me: any = await User.findById(actorId(req))
    .select('+posApiKeys +posApiKeyHash +posApiKeyPrefix +posApiKeyLastUsedAt');
  if (!me) return res.status(404).json({ error: 'not_found' });
  const keys = (me.posApiKeys || []).map(serializeKey);
  if (me.posApiKeyHash) {
    keys.unshift({
      id: 'legacy',
      label: 'Clave principal',
      mode: 'live',
      prefix: me.posApiKeyPrefix || null,
      lastUsedAt: me.posApiKeyLastUsedAt || null,
      createdAt: null,
    });
  }
  res.json({ keys });
}

// POST /api/partners/me/pos-keys — crea una clave nueva (etiqueta + modo);
// la clave en claro se muestra una sola vez.
export async function createPosKey(req: Request, res: Response) {
  const label = String(req.body?.label || '').trim().slice(0, 60) || 'TPV';
  const mode = req.body?.mode === 'test' ? 'test' : 'live';
  const me: any = await User.findById(actorId(req)).select('+posApiKeys');
  if (!me) return res.status(404).json({ error: 'not_found' });
  if ((me.posApiKeys?.length || 0) >= MAX_POS_KEYS) {
    return res.status(400).json({ error: 'too_many_keys', max: MAX_POS_KEYS });
  }
  const { key, hash, prefix } = newPosKey(mode);
  me.posApiKeys = me.posApiKeys || [];
  me.posApiKeys.push({ label, mode, hash, prefix } as any);
  await me.save();
  const created = me.posApiKeys[me.posApiKeys.length - 1];
  res.status(201).json({ key, ...serializeKey(created) });
}

// DELETE /api/partners/me/pos-keys/:keyId — revoca solo esa clave (las demás
// cajas siguen funcionando). 'legacy' revoca la clave única original.
export async function revokePosKey(req: Request, res: Response) {
  const keyId = String(req.params.keyId || '');
  const meId = actorId(req);
  if (keyId === 'legacy') {
    await User.updateOne({ _id: meId }, { $unset: { posApiKeyHash: 1, posApiKeyPrefix: 1, posApiKeyLastUsedAt: 1 } });
    return res.json({ ok: true });
  }
  if (!Types.ObjectId.isValid(keyId)) return res.status(400).json({ error: 'invalid_key_id' });
  const r = await User.updateOne({ _id: meId }, { $pull: { posApiKeys: { _id: keyId } } });
  if (!r.modifiedCount) return res.status(404).json({ error: 'key_not_found' });
  res.json({ ok: true });
}

// GET /api/partners/me/pos-key — estado de la clave legado (compatibilidad).
export async function getPosKeyStatus(req: Request, res: Response) {
  const me: any = await User.findById(actorId(req)).select('+posApiKeyHash +posApiKeyPrefix +posApiKeyLastUsedAt');
  if (!me) return res.status(404).json({ error: 'not_found' });
  res.json({
    configured: !!me.posApiKeyHash,
    prefix: me.posApiKeyPrefix || null,
    lastUsedAt: me.posApiKeyLastUsedAt || null,
  });
}

// POST /api/partners/me/pos-key — genera (o rota) la clave legado; se muestra una sola vez.
export async function rotatePosKey(req: Request, res: Response) {
  const { key, hash, prefix } = newPosKey('live');
  const me = await User.findByIdAndUpdate(
    actorId(req),
    { posApiKeyHash: hash, posApiKeyPrefix: prefix },
    { new: true },
  );
  if (!me) return res.status(404).json({ error: 'not_found' });
  res.json({ key, prefix });
}

// --- Endpoints del TPV (autenticados por X-Api-Key vía posAuth) -------------

// POST /api/pos/identify — el TPV escanea el QR/código del cliente: devuelve su
// identidad y los cupones aplicables en este establecimiento (para el descuento en caja).
export async function posIdentify(req: Request, res: Response) {
  const partnerId = actorId(req);
  const userId = await resolvePresentUser(req.body);
  if (!userId) return res.status(400).json({ error: 'invalid_user_code' });
  const user = await User.findById(userId).select('name');
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  // En sandbox no se persiste la identificación (no ensucia el informe de fugas).
  if (!isTestMode(req)) await recordIdentification(partnerId, userId);
  const coupons = await eligibleCoupons(partnerId, userId);
  res.json({
    userId: String(user._id),
    name: user.name,
    coupons: coupons.map(serializeCoupon),
    ...(isTestMode(req) ? { test: true } : {}),
  });
}

// Selección de cupones a consumir según el body: couponIds explícitos (los que la
// caja descontó de verdad), o todos los elegibles con applyCoupons:true; por
// defecto ninguno.
async function couponsToApply(partnerId: string, userId: string, body: any) {
  const explicit = Array.isArray(body?.couponIds)
    ? body.couponIds.map(String).filter((id: string) => Types.ObjectId.isValid(id))
    : null;
  if (explicit?.length) {
    return (await eligibleCoupons(partnerId, userId)).filter(c => explicit.includes(String(c._id)));
  }
  if (body?.applyCoupons === true) return eligibleCoupons(partnerId, userId);
  return [];
}

// Respuesta 200 para un reintento con el mismo externalRef: la venta ya existía.
// Devuelve exactamente lo mismo que la llamada original (cupones incluidos), para
// que el TPV pueda reimprimir el ticket real.
function duplicateSaleResponse(res: Response, sale: any) {
  const appliedCoupons = (sale.appliedCoupons || []).map((c: any) => ({
    _id: String(c.couponId),
    title: c.title,
    discount: c.discount,
    bonusPatitas: c.bonusPatitas || 0,
    targetAnimalCode: c.targetAnimalCode || null,
  }));
  res.json({
    ok: true,
    duplicate: true,
    saleId: String(sale._id),
    commissionPct: sale.commissionPct,
    commissionEur: sale.commissionEur,
    patitasEarned: (sale.patitasEarned || 0) + (sale.couponPatitas || 0),
    appliedCoupons,
  });
}

// POST /api/pos/sales — el TPV exporta la venta: importe + líneas del ticket.
// `externalRef` (id del ticket) hace la llamada idempotente. Con clave de test
// se valida y simula todo (misma respuesta) sin persistir ni consumir nada.
export async function posSale(req: Request, res: Response) {
  const partner: any = (req as any).user;
  const partnerId = actorId(req);

  const userId = await resolvePresentUser(req.body);
  if (!userId) return res.status(400).json({ error: 'invalid_user_code' });
  const user = await User.findById(userId).select('name');
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  const amountEur = Number(req.body?.amountEur);
  if (!Number.isFinite(amountEur) || amountEur <= 0 || amountEur > 100000) {
    return res.status(400).json({ error: 'invalid_amount' });
  }

  // Sandbox: mismas validaciones y cálculo, cero efectos (ni venta, ni cupones,
  // ni Patitas). El integrador del TPV puede probar contra producción sin miedo.
  if (isTestMode(req)) {
    const figures = computeSaleFigures(partner, amountEur);
    const coupons = await couponsToApply(partnerId, userId, req.body);
    const couponPatitas = coupons.reduce(
      (sum, c: any) => sum + (Number(c.bonusPatitas) > 0 ? Math.round(Number(c.bonusPatitas)) : COUPON_PATITAS_REWARD_DEFAULT),
      0,
    );
    return res.status(201).json({
      ok: true,
      test: true,
      saleId: null,
      commissionPct: figures.commissionPct,
      commissionEur: figures.commissionEur,
      patitasEarned: figures.patitas + couponPatitas,
      appliedCoupons: coupons.map(serializeCoupon),
    });
  }

  const externalRef = typeof req.body?.externalRef === 'string' ? req.body.externalRef.trim().slice(0, 120) : '';
  if (externalRef) {
    const existing = await Sale.findOne({ partnerId, externalRef }).lean();
    if (existing) return duplicateSaleResponse(res, existing);
  }

  let sale;
  try {
    sale = await recordSale(partner, userId, amountEur, req.body?.items, externalRef ? { externalRef } : {});
  } catch (err: any) {
    // Carrera entre reintentos concurrentes: el índice único (partnerId, externalRef)
    // deja pasar solo al primero; los demás devuelven la venta ya creada.
    if (err?.code === 11000 && externalRef) {
      const existing = await Sale.findOne({ partnerId, externalRef }).lean();
      if (existing) return duplicateSaleResponse(res, existing);
    }
    throw err;
  }

  const coupons = await couponsToApply(partnerId, userId, req.body);
  const appliedCoupons: any[] = [];
  let couponPatitas = 0;
  for (const c of coupons) {
    // Consumir + acreditar el bonus como unidad atómica (transacción si el
    // despliegue lo permite): no queda cupón quemado sin Patitas ni al revés.
    // El findOneAndUpdate con filtro usedAt evita el doble uso con cajas concurrentes.
    const applied = await withTxnIfAvailable(async (session) => {
      const used: any = await Coupon.findOneAndUpdate(
        { _id: c._id, usedAt: { $exists: false } },
        { usedAt: new Date(), usedBy: partnerId },
        { new: true, session },
      );
      if (!used) return null;
      const reward = Number(used.bonusPatitas) > 0 ? Math.round(Number(used.bonusPatitas)) : COUPON_PATITAS_REWARD_DEFAULT;
      await earnForUser({
        userId, amount: reward, source: 'coupon', partnerId, couponId: String(used._id),
        concept: `Cupón: ${used.title || used.copy}`,
      }, session);
      return { used, reward };
    });
    if (!applied) continue;
    couponPatitas += applied.reward;
    appliedCoupons.push({ ...serializeCoupon(applied.used), bonusPatitas: applied.reward });
  }

  // Persistir los cupones consumidos en la venta: auditoría + respuesta idéntica
  // si el TPV reintenta con el mismo externalRef.
  if (appliedCoupons.length) {
    await Sale.updateOne(
      { _id: sale.saleId },
      {
        couponPatitas,
        appliedCoupons: appliedCoupons.map(c => ({
          couponId: c._id,
          title: c.title,
          discount: c.discount,
          bonusPatitas: c.bonusPatitas,
          targetAnimalCode: c.targetAnimalCode,
        })),
      },
    );
  }

  res.status(201).json({
    ok: true,
    saleId: sale.saleId,
    commissionPct: sale.commissionPct,
    commissionEur: sale.commissionEur,
    patitasEarned: sale.patitasEarned + couponPatitas,
    appliedCoupons,
  });
}
