import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { Coupon } from '../models/coupon.model';
import { User } from '../models/user.model';

const codePattern = /^[A-Z0-9]+-\d{3}$/;

function normalizeCopy(value?: string) {
  return typeof value === 'string' ? value.trim() : undefined;
}

function normalizeDiscount(value?: string | number) {
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

async function resolvePartner(partnerId?: string) {
  if (!partnerId || !isValidObjectId(partnerId)) {
    return null;
  }
  const partner = await User.findById(partnerId).select('name role email');
  if (!partner) return null;
  if (!['store', 'vet'].includes(partner.role)) return null;
  return partner;
}

function serializeCoupon(doc: any) {
  if (!doc) return null;
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
    discount: doc.discount,
    targetAnimalCode: doc.targetAnimalCode,
    active: doc.active,
    expiresAt: doc.expiresAt,
    usedAt: doc.usedAt,
    usedBy: doc.usedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listAdminCoupons(_req: Request, res: Response) {
  const coupons = await Coupon.find({})
    .sort({ createdAt: -1 })
    .populate('partnerId', 'name role');
  res.json({ items: coupons.map(serializeCoupon) });
}

export async function listCouponPartners(_req: Request, res: Response) {
  const partners = await User.find({ role: { $in: ['store', 'vet'] } })
    .select('name email role')
    .sort({ name: 1 });
  res.json({
    items: partners.map(p => ({
      _id: p._id,
      name: p.name || p.email,
      email: p.email,
      role: p.role,
    })),
  });
}

export async function createAdminCoupon(req: Request, res: Response) {
  const { partnerId, copy, discount, targetAnimalCode, expiresAt } = req.body || {};
  const normalizedCopy = normalizeCopy(copy);
  if (!normalizedCopy) {
    return res.status(400).json({ error: 'copy_required' });
  }
  const normalizedDiscount = normalizeDiscount(discount);
  if (!normalizedDiscount) {
    return res.status(400).json({ error: 'discount_required' });
  }
  const partner = await resolvePartner(partnerId);
  if (!partner) {
    return res.status(400).json({ error: 'invalid_partner' });
  }
  if (targetAnimalCode && !codePattern.test(String(targetAnimalCode).trim().toUpperCase())) {
    return res.status(400).json({ error: 'invalid_animal_code' });
  }
  let expiresDate: Date | undefined;
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'invalid_expiration' });
    }
    expiresDate = parsed;
  }

  const coupon = await Coupon.create({
    partnerId: partner._id,
    partnerType: partner.role,
    copy: normalizedCopy,
    title: normalizedCopy,
    discount: normalizedDiscount,
    targetAnimalCode: targetAnimalCode ? String(targetAnimalCode).trim().toUpperCase() : undefined,
    expiresAt: expiresDate,
    active: true,
  });
  const populated = await coupon.populate('partnerId', 'name role');
  res.status(201).json(serializeCoupon(populated));
}

export async function updateAdminCoupon(req: Request, res: Response) {
  const updates: any = {};
  const { copy, discount, targetAnimalCode, expiresAt, partnerId } = req.body || {};
  if (typeof copy !== 'undefined') {
    const normalizedCopy = normalizeCopy(copy);
    if (!normalizedCopy) {
      return res.status(400).json({ error: 'copy_required' });
    }
    updates.copy = normalizedCopy;
    updates.title = normalizedCopy;
  }
  if (typeof discount !== 'undefined') {
    const normalizedDiscount = normalizeDiscount(discount);
    if (!normalizedDiscount) {
      return res.status(400).json({ error: 'discount_required' });
    }
    updates.discount = normalizedDiscount;
  }
  if (typeof targetAnimalCode !== 'undefined') {
    if (targetAnimalCode && !codePattern.test(String(targetAnimalCode).trim().toUpperCase())) {
      return res.status(400).json({ error: 'invalid_animal_code' });
    }
    updates.targetAnimalCode = targetAnimalCode ? String(targetAnimalCode).trim().toUpperCase() : undefined;
  }
  if (typeof expiresAt !== 'undefined') {
    if (!expiresAt) {
      updates.expiresAt = undefined;
    } else {
      const parsed = new Date(expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'invalid_expiration' });
      }
      updates.expiresAt = parsed;
    }
  }
  if (typeof partnerId !== 'undefined') {
    const partner = await resolvePartner(partnerId);
    if (!partner) {
      return res.status(400).json({ error: 'invalid_partner' });
    }
    updates.partnerId = partner._id;
    updates.partnerType = partner.role;
  }

  const coupon = await Coupon.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true },
  ).populate('partnerId', 'name role');

  if (!coupon) {
    return res.status(404).json({ error: 'coupon_not_found' });
  }
  res.json(serializeCoupon(coupon));
}

export async function toggleAdminCoupon(req: Request, res: Response) {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) {
    return res.status(404).json({ error: 'coupon_not_found' });
  }
  coupon.active = !coupon.active;
  await coupon.save();
  const populated = await coupon.populate('partnerId', 'name role');
  res.json(serializeCoupon(populated));
}
