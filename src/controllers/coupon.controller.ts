import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { Coupon } from '../models/coupon.model';
import { PatitaLog } from '../models/patitaLog.model';
import { User } from '../models/user.model';
import { earnForUser, COUPON_PATITAS_REWARD_DEFAULT } from '../utils/patitas';
import { COUPON_BONUS_MAX_PATITAS, COUPON_ACTIVE_MAX_PER_PARTNER } from '../utils/limits';
import { beneficiarioValido, patitasCuponDisponibles, recompensaCupon, costePatitasEur, tarifaPatitas, cerrar } from '../utils/couponRules';
import { cargarPatitas } from '../utils/sales';
import { withTxnIfAvailable } from '../utils/txn';
import { resolveUserFromBody } from './patitas.controller';

const codePattern = /^[A-Z0-9]+-\d{3}$/;

const pickFields = (body: any) => ({
  partnerId: typeof body.partnerId === 'string' ? body.partnerId.trim() : undefined,
  partnerType: typeof body.partnerType === 'string' ? body.partnerType.trim().toLowerCase() : undefined,
  copy: typeof body.copy === 'string' ? body.copy.trim() : undefined,
  title: typeof body.title === 'string' ? body.title.trim() : undefined,
  description: typeof body.description === 'string' ? body.description.trim() : undefined,
  discount: typeof body.discount === 'string' ? body.discount.trim() : undefined,
  bonusPatitas:
    typeof body.bonusPatitas === 'number'
      ? body.bonusPatitas
      : typeof body.bonusPatitas === 'string'
        ? Number(body.bonusPatitas)
        : undefined,
  active: typeof body.active === 'boolean' ? body.active : undefined,
  expiresAt:
    typeof body.expiresAt === 'string' || body.expiresAt instanceof Date
      ? new Date(body.expiresAt)
      : undefined,
  targetAnimalCode:
    typeof body.targetAnimalCode === 'string'
      ? body.targetAnimalCode.trim().toUpperCase() || undefined
      : body.targetAnimalCode === null
        ? null
        : undefined,
});

function serializeCoupon(doc: any) {
  const partner = doc.partnerId && doc.partnerId._id
    ? {
        _id: doc.partnerId._id.toString(),
        name: doc.partnerId.name,
        role: doc.partnerId.role,
      }
    : undefined;
  return {
    _id: doc._id,
    partnerId: doc.partnerId?._id ? doc.partnerId._id.toString() : doc.partnerId?.toString?.() || doc.partnerId,
    partner,
    partnerType: doc.partnerType,
    copy: doc.copy,
    title: doc.title,
    description: doc.description,
    discount: doc.discount,
    bonusPatitas: doc.bonusPatitas,
    // Lo que de verdad concede el servidor al usarlo (AUD-2, FAC-122): la web
    // prometía 40 cuando, sin bonus propio, se dan COUPON_PATITAS_REWARD_DEFAULT.
    rewardPatitas: recompensaCupon(doc.bonusPatitas),
    costEur: costePatitasEur(recompensaCupon(doc.bonusPatitas)),
    active: doc.active,
    sponsored: !!doc.sponsored,
    sponsorshipStatus: doc.sponsorshipStatus || 'none',
    targetAnimalCode: doc.targetAnimalCode,
    expiresAt: doc.expiresAt,
    usedAt: doc.usedAt,
    usedBy: doc.usedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listCoupons(req: Request, res: Response) {
  const all = req.query.all === 'true';
  const filter: any = {};
  if (!all) {
    filter.active = true;
    filter.usedAt = { $exists: false };
    filter.$or = [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ];
  }
  const coupons = await Coupon.find(filter)
    .sort({ createdAt: -1 })
    .populate('partnerId', 'name role')
    .lean();
  res.json({ items: coupons.map(serializeCoupon) });
}

export async function createCoupon(req: Request, res: Response) {
  const {
    partnerId,
    partnerType,
    copy,
    title,
    description,
    discount,
    active,
    targetAnimalCode,
    expiresAt,
    bonusPatitas,
  } = pickFields(req.body);

  // Dos caminos: un partner concreto (se toma su rol) o un cupón
  // creado por admin indicando el tipo de partner (store/vet).
  let resolvedPartnerType: string | undefined = partnerType;
  if (partnerId) {
    if (!isValidObjectId(partnerId)) {
      return res.status(400).json({ error: 'invalid_partner' });
    }
    const partner = await User.findById(partnerId).select('role');
    if (!partner || !['store', 'vet'].includes(partner.role)) {
      return res.status(400).json({ error: 'invalid_partner' });
    }
    resolvedPartnerType = partner.role;
  } else if (!resolvedPartnerType || !['store', 'vet'].includes(resolvedPartnerType)) {
    return res.status(400).json({ error: 'invalid_partner_type' });
  }

  const copyValue = copy || title;
  if (!copyValue || !discount) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (targetAnimalCode && !codePattern.test(targetAnimalCode)) {
    return res.status(400).json({ error: 'invalid_animal_code' });
  }
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return res.status(400).json({ error: 'invalid_expiration' });
  }

  const coupon = await Coupon.create({
    ...(partnerId ? { partnerId } : {}),
    partnerType: resolvedPartnerType,
    copy: copyValue,
    title: title || copyValue,
    description: description || undefined,
    discount,
    bonusPatitas: Number.isFinite(bonusPatitas as number) ? Number(bonusPatitas) : 0,
    targetAnimalCode: targetAnimalCode || undefined,
    active: typeof active === 'boolean' ? active : true,
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : undefined,
  });
  res.status(201).json(coupon);
}

export async function updateCoupon(req: Request, res: Response) {
  const data = pickFields(req.body);
  if (data.partnerId && !isValidObjectId(data.partnerId)) {
    return res.status(400).json({ error: 'invalid_partner' });
  }
  if (data.partnerId) {
    const partner = await User.findById(data.partnerId).select('role');
    if (!partner || !['store', 'vet'].includes(partner.role)) {
      return res.status(400).json({ error: 'invalid_partner' });
    }
    data.partnerType = partner.role;
  }
  if (typeof data.copy !== 'undefined' && !data.copy?.trim()) {
    return res.status(400).json({ error: 'copy_required' });
  }
  if (typeof data.discount !== 'undefined' && !data.discount?.trim?.()) {
    return res.status(400).json({ error: 'discount_required' });
  }
  if (typeof data.targetAnimalCode === 'string' && data.targetAnimalCode && !codePattern.test(data.targetAnimalCode)) {
    return res.status(400).json({ error: 'invalid_animal_code' });
  }
  if (data.expiresAt && Number.isNaN(data.expiresAt.getTime())) {
    return res.status(400).json({ error: 'invalid_expiration' });
  }
  const coupon = await Coupon.findByIdAndUpdate(
    req.params.id,
    { $set: Object.fromEntries(Object.entries(data).filter(([, value]) => typeof value !== 'undefined')) },
    { new: true },
  );
  if (!coupon) return res.status(404).json({ error: 'coupon_not_found' });
  res.json(coupon);
}

// --- Autoservicio del partner -------------------------------------------------
//
// Un partner gestiona SOLO sus cupones. `partnerId` y `partnerType` no se leen
// nunca del body: salen del token. Si se leyeran, una tienda podría publicar
// cupones a nombre de la clínica de al lado.

function meId(req: Request): string {
  const user: any = (req as any).user;
  return String(user._id || user.id);
}

/** Valida los campos que un partner sí puede decidir. Devuelve el error o null. */
function partnerCouponError(data: ReturnType<typeof pickFields>) {
  if (data.targetAnimalCode && !codePattern.test(data.targetAnimalCode)) {
    return { status: 400, body: { error: 'invalid_animal_code' } };
  }
  if (data.expiresAt) {
    if (Number.isNaN(data.expiresAt.getTime())) {
      return { status: 400, body: { error: 'invalid_expiration' } };
    }
    // Un cupón que nace caducado no es un cupón, es una queja de un cliente.
    if (data.expiresAt <= new Date()) {
      return { status: 400, body: { error: 'expiration_in_past' } };
    }
  }
  if (typeof data.bonusPatitas !== 'undefined') {
    const bonus = Number(data.bonusPatitas);
    if (!Number.isFinite(bonus) || bonus < 0) {
      return { status: 400, body: { error: 'invalid_bonus' } };
    }
    if (bonus > COUPON_BONUS_MAX_PATITAS) {
      return { status: 400, body: { error: 'bonus_too_large', max: COUPON_BONUS_MAX_PATITAS } };
    }
  }
  return null;
}

export async function listMyCoupons(req: Request, res: Response) {
  // Sin filtrar por activo/caducado a propósito: el partner tiene que poder ver
  // los que ya se gastaron, que es justo lo que explica por qué no aparecen.
  const coupons = await Coupon.find({ partnerId: meId(req) })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ items: coupons.map(serializeCoupon), tarifa: tarifaPatitas() });
}

/** Cupones del comercio que aún se pueden usar (activos, sin usar y sin caducar). */
async function activosDe(partnerId: string, session?: any) {
  return Coupon.countDocuments({
    partnerId, active: true, usedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).session(session ?? null);
}
const utilizable = (c: { active?: boolean; usedAt?: any; expiresAt?: any }) =>
  c.active !== false && !c.usedAt && (!c.expiresAt || new Date(c.expiresAt).getTime() > Date.now());

export async function createMyCoupon(req: Request, res: Response) {
  const user: any = (req as any).user;
  const data = pickFields(req.body);

  const copyValue = data.copy || data.title;
  if (!copyValue || !data.discount) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  const invalid = partnerCouponError(data);
  if (invalid) return res.status(invalid.status).json(invalid.body);
  // Contar y crear van juntos, con el cerrojo del comercio (AUD-5, FAC-156).
  const coupon = await withTxnIfAvailable(async session => {
  if (user.role !== 'admin' && data.active !== false) {
    await cerrar(`activos|${meId(req)}`, session);
    if (await activosDe(meId(req), session) >= COUPON_ACTIVE_MAX_PER_PARTNER) return null;
  }
  const [creado] = await Coupon.create([{
    partnerId: meId(req),
    partnerType: user.role,
    copy: copyValue,
    title: data.title || copyValue,
    description: data.description || undefined,
    discount: data.discount,
    bonusPatitas: Number.isFinite(data.bonusPatitas as number) ? Number(data.bonusPatitas) : 0,
    targetAnimalCode: data.targetAnimalCode || undefined,
    active: typeof data.active === 'boolean' ? data.active : true,
    expiresAt: data.expiresAt,
  }], session ? { session } : {});
  return creado;
  });
  if (!coupon) return res.status(409).json({ error: 'too_many_active_coupons', max: COUPON_ACTIVE_MAX_PER_PARTNER });
  res.status(201).json(serializeCoupon(coupon));
}

export async function updateMyCoupon(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'coupon_not_found' });
  }
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon || String(coupon.partnerId) !== meId(req)) {
    // 404 y no 403: quién tiene qué cupón no es asunto de otro partner.
    return res.status(404).json({ error: 'coupon_not_found' });
  }
  if (coupon.usedAt) {
    return res.status(409).json({ error: 'coupon_already_used' });
  }

  const data = pickFields(req.body);
  if (typeof data.copy !== 'undefined' && !data.copy.trim()) {
    return res.status(400).json({ error: 'copy_required' });
  }
  if (typeof data.discount !== 'undefined' && !data.discount.trim()) {
    return res.status(400).json({ error: 'discount_required' });
  }
  const invalid = partnerCouponError(data);
  if (invalid) return res.status(invalid.status).json(invalid.body);

  // Lista blanca explícita: pickFields ya deja fuera sponsored/usedAt, y
  // partnerId/partnerType se ignoran aunque vengan en el body.
  // Si pasa de no utilizable a utilizable (reactivarlo o alargar su caducidad),
  // cuenta para el tope (AUD-5, FAC-156).
  const antes = utilizable(coupon as any);
  const despues = utilizable({
    active: typeof data.active === 'boolean' ? data.active : coupon.active,
    usedAt: coupon.usedAt,
    expiresAt: typeof data.expiresAt !== 'undefined' ? data.expiresAt : coupon.expiresAt,
  });
  if (!antes && despues && (req as any).user?.role !== 'admin' && await activosDe(meId(req)) >= COUPON_ACTIVE_MAX_PER_PARTNER) {
    return res.status(409).json({ error: 'too_many_active_coupons', max: COUPON_ACTIVE_MAX_PER_PARTNER });
  }
  const editable = ['copy', 'title', 'description', 'discount', 'bonusPatitas', 'active', 'expiresAt', 'targetAnimalCode'] as const;
  for (const key of editable) {
    const value = (data as any)[key];
    if (typeof value !== 'undefined') (coupon as any)[key] = value;
  }
  if (typeof data.copy !== 'undefined' && !coupon.title) coupon.title = data.copy;
  await coupon.save();
  res.json(serializeCoupon(coupon));
}

export async function listAvailableCoupons(req: Request, res: Response) {
  const user: any = (req as any).user;
  if (!user || !['store', 'vet', 'admin'].includes(user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const code = String((req.query.code as string) || '').trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ error: 'code_required' });
  }
  const now = new Date();
  let partnerFilter: string | undefined;
  if (user.role === 'admin') {
    const queryPartnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId : undefined;
    if (queryPartnerId && isValidObjectId(queryPartnerId)) {
      partnerFilter = queryPartnerId;
    }
  } else {
    partnerFilter = String(user._id || user.id);
  }
  if (!partnerFilter) {
    return res.status(400).json({ error: 'partner_required' });
  }
  if (!isValidObjectId(partnerFilter)) {
    return res.status(400).json({ error: 'invalid_partner' });
  }
  const filter: any = {
    partnerId: partnerFilter,
    active: true,
    usedAt: { $exists: false },
    $and: [
      {
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: now } },
        ],
      },
      {
        $or: [
          { targetAnimalCode: { $exists: false } },
          { targetAnimalCode: null },
          { targetAnimalCode: code },
        ],
      },
    ],
  };
  const partnerType = user.role === 'admin'
    ? (typeof req.query.partnerType === 'string' ? req.query.partnerType : undefined)
    : user.role;
  if (partnerType && ['store', 'vet'].includes(partnerType)) {
    filter.partnerType = partnerType;
  }
  const coupons = await Coupon.find(filter).sort({ createdAt: -1 }).lean();
  res.json({ items: coupons });
}

export async function useCoupon(req: Request, res: Response) {
  const user: any = (req as any).user;
  if (!user || !['store', 'vet', 'admin'].includes(user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const body = (req.body || {}) as { animalCode?: string; logId?: string; userId?: string; userToken?: string; code?: string };
  const { animalCode, logId } = body;
  const normalizedCode = (animalCode || '').trim().toUpperCase();
  const partnerId = String(user._id || user.id);

  // A quién van las Patitas (AUD-3, FAC-127): solo al cliente que está delante,
  // probado con su QR (userToken) o su código corto. Un `userId` suelto ya no
  // vale: un partner creaba cupones y se los acreditaba a cualquier cuenta.
  let beneficiaryId: string | null = null;
  if (body.userToken || body.code) {
    beneficiaryId = await resolveUserFromBody(body, { allowUserId: false });
    if (!beneficiaryId) return res.status(400).json({ error: 'invalid_user_code' });
    if (!(await beneficiarioValido(partnerId, beneficiaryId))) {
      return res.status(400).json({ error: 'invalid_beneficiary' });
    }
  } else if (body.userId) {
    return res.status(400).json({ error: 'invalid_user_code' });
  }

  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) return res.status(404).json({ error: 'coupon_not_found' });

  const role = user.role === 'admin' ? coupon.partnerType : user.role;
  if (coupon.partnerType !== role) {
    return res.status(403).json({ error: 'coupon_partner_mismatch' });
  }
  if (user.role !== 'admin' && String(coupon.partnerId) !== partnerId) {
    return res.status(403).json({ error: 'invalid_partner_coupon' });
  }
  if (!coupon.active) {
    return res.status(400).json({ error: 'coupon_inactive' });
  }
  if (coupon.usedAt) {
    return res.status(400).json({ error: 'coupon_already_used' });
  }
  if (coupon.expiresAt && coupon.expiresAt <= new Date()) {
    return res.status(400).json({ error: 'coupon_expired' });
  }
  if (coupon.targetAnimalCode && coupon.targetAnimalCode !== normalizedCode) {
    return res.status(400).json({ error: 'coupon_animal_mismatch' });
  }
  let updatedLog: any;
  if (logId) {
    if (!isValidObjectId(logId)) {
      return res.status(400).json({ error: 'invalid_log' });
    }
    updatedLog = await PatitaLog.findById(logId);
    if (!updatedLog) {
      return res.status(404).json({ error: 'log_not_found' });
    }
    if (updatedLog.source !== coupon.partnerType) {
      return res.status(400).json({ error: 'log_partner_mismatch' });
    }
    // Solo un registro propio y, si hay cliente, suyo (AUD-4, FAC-141): con el
    // logId de otro comercio se reescribía su historial. 404, para no revelarlo.
    if (user.role !== 'admin' && (String(updatedLog.partnerId || '') !== partnerId
      || (beneficiaryId && String(updatedLog.userId || '') !== beneficiaryId))) {
      return res.status(404).json({ error: 'log_not_found' });
    }
  }

  // Reclamarlo es atómico (AUD-3): dos peticiones a la vez ya no lo usan las dos.
  // Marcarlo y acreditar van juntos en la transacción; sin réplica, si el abono
  // falla se devuelve el cupón a su estado.
  let earn: any;
  let claimed: any;
  let sinSesion = false;
  let tope: any = null;
  try {
    await withTxnIfAvailable(async session => {
      sinSesion = !session;
      tope = null;
      claimed = await Coupon.findOneAndUpdate(
        { _id: coupon._id, active: true, usedAt: null },
        { $set: { usedAt: new Date(), usedBy: user._id || user.id } },
        { new: true, session },
      );
      if (!claimed) return;
      if (beneficiaryId) {
        const reward = Number(coupon.bonusPatitas) > 0 ? Math.round(Number(coupon.bonusPatitas)) : COUPON_PATITAS_REWARD_DEFAULT;
        // Tope por cliente y comercio (AUD-4, FAC-138): pasarse deshace el uso.
        if (user.role !== 'admin') {
          const disponibles = await patitasCuponDisponibles(beneficiaryId, partnerId, session);
          if (reward > disponibles) {
            tope = { error: 'coupon_patitas_limit', available: disponibles };
            throw new Error('coupon_patitas_limit');
          }
        }
        earn = await earnForUser({
          userId: beneficiaryId,
          amount: reward,
          source: 'coupon',
          partnerId,
          couponId: String(coupon._id),
          concept: coupon.title || coupon.copy || 'Cupón',
        }, session);
        // Lo paga el comercio del cupón, en su comisión del mes (decisión de Jorge).
        await cargarPatitas({
          partnerId: String(coupon.partnerId), partnerType: coupon.partnerType as 'store' | 'vet', userId: beneficiaryId,
          patitas: reward, kind: 'coupon',
          appliedCoupon: { couponId: coupon._id, title: coupon.title, discount: coupon.discount, bonusPatitas: reward, targetAnimalCode: coupon.targetAnimalCode },
        }, session);
      }
    });
  } catch (err) {
    if (sinSesion && claimed) await Coupon.updateOne({ _id: coupon._id }, { $unset: { usedAt: 1, usedBy: 1 } });
    if (tope) return res.status(429).json(tope);
    throw err;
  }
  if (!claimed) return res.status(400).json({ error: 'coupon_already_used' });

  if (updatedLog) {
    await PatitaLog.updateOne({ _id: updatedLog._id }, { $set: { couponId: coupon._id } });
  }

  res.json({
    ok: true,
    coupon: claimed,
    logId: updatedLog ? String(updatedLog._id) : undefined,
    earn,
  });
}
