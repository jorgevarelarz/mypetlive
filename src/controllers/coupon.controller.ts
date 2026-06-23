import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { Coupon } from '../models/coupon.model';
import { PatitaLog } from '../models/patitaLog.model';
import { User } from '../models/user.model';

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
  const coupons = await Coupon.find(filter).sort({ createdAt: -1 }).lean();
  res.json({ items: coupons });
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
  const { animalCode, logId } = (req.body || {}) as { animalCode?: string; logId?: string };
  const normalizedCode = (animalCode || '').trim().toUpperCase();
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) return res.status(404).json({ error: 'coupon_not_found' });

  const role = user.role === 'admin' ? coupon.partnerType : user.role;
  if (coupon.partnerType !== role) {
    return res.status(403).json({ error: 'coupon_partner_mismatch' });
  }
  if (user.role !== 'admin' && String(coupon.partnerId) !== String(user._id || user.id)) {
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

  coupon.usedAt = new Date();
  coupon.usedBy = user._id || user.id;
  await coupon.save();

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
    updatedLog.couponId = coupon._id;
    await updatedLog.save();
  }

  res.json({
    ok: true,
    coupon,
    logId: updatedLog ? String(updatedLog._id) : undefined,
  });
}
