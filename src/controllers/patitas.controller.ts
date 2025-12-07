import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { User } from '../models/user.model';
import { PatitaLog } from '../models/patitaLog.model';
import { Animal, ensureAnimalCode } from '../models/animal.model';
import { Coupon } from '../models/coupon.model';

const objectIdRegex = /^[a-f\d]{24}$/i;
const CLICK_LIMIT = 10;
const CLICK_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_PLATFORM_RATE = 0.08;
const DEFAULT_DONATION_SHARE = 0.5;

function clampRate(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  if (value > 1) return 1;
  return value;
}

function parseDecimal(value?: string | number | null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function resolvePlatformRate() {
  const explicit = parseDecimal(process.env.PATITAS_PLATFORM_RATE);
  if (typeof explicit === 'number') {
    return clampRate(explicit > 1 ? explicit / 100 : explicit, DEFAULT_PLATFORM_RATE);
  }
  const pct = parseDecimal(process.env.PLATFORM_FEE_PCT);
  if (typeof pct === 'number') {
    return clampRate(pct / 100, DEFAULT_PLATFORM_RATE);
  }
  return DEFAULT_PLATFORM_RATE;
}

function resolveDonationShare() {
  const share = parseDecimal(process.env.PATITAS_DONATION_SHARE);
  if (typeof share === 'number') {
    return clampRate(share, DEFAULT_DONATION_SHARE);
  }
  return DEFAULT_DONATION_SHARE;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

const PLATFORM_RATE = resolvePlatformRate();
const DONATION_SHARE = resolveDonationShare();

type RateEntry = {
  count: number;
  resetAt: number;
};

const clickRateStore = new Map<string, RateEntry>();

function normalizeId(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (!objectIdRegex.test(String(value))) return undefined;
  return String(value);
}

export async function listProtectoras(_req: Request, res: Response) {
  const items = await User.find({ role: { $in: ['landlord', 'protectora'] } })
    .select('name')
    .sort({ name: 1 })
    .lean();
  return res.json({
    items: items.map(item => ({
      id: String(item._id),
      name: item.name || 'Protectora sin nombre',
    })),
  });
}

export async function getPatitasBalance(req: Request, res: Response) {
  const { shelterId } = req.query as { shelterId?: string };
  const user: any = (req as any).user;
  const explicitId = normalizeId(shelterId);

  let targetId: string | undefined = explicitId;
  if (!targetId && user?.role === 'landlord') {
    targetId = String(user._id || user.id);
  }

  if (targetId) {
    const protectora = await User.findOne({ _id: targetId, role: 'landlord' }).select('patitas role');
    if (!protectora) {
      return res.status(404).json({ error: 'protectora_not_found' });
    }
    return res.json({ patitas: protectora.patitas || 0, protectoraId: protectora.id });
  }

  const anyProtectora = await User.findOne({ role: 'landlord' }).select('patitas role');
  if (!anyProtectora) {
    return res.json({ patitas: 0 });
  }
  return res.json({ patitas: anyProtectora.patitas || 0, protectoraId: anyProtectora.id });
}

export async function addPatitas(req: Request, res: Response) {
  const { id } = req.params;
  const amount = Number((req.body as any)?.amount);
  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'invalid_protectora_id' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'invalid_amount' });
  }

  const updated = await User.findOneAndUpdate(
    { _id: id, role: 'landlord' },
    { $inc: { patitas: amount } },
    { new: true },
  ).select('patitas role');

  if (!updated) {
    return res.status(404).json({ error: 'protectora_not_found' });
  }

  return res.json({ patitas: updated.patitas || 0, protectoraId: updated.id });
}

function consumeClickAllowance(userId: string) {
  const now = Date.now();
  const entry = clickRateStore.get(userId);
  if (!entry || entry.resetAt <= now) {
    clickRateStore.set(userId, { count: 1, resetAt: now + CLICK_WINDOW_MS });
    return { ok: true };
  }
  if (entry.count >= CLICK_LIMIT) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { ok: true };
}

export async function echoPatita(req: Request, res: Response) {
  const user: any = (req as any).user;
  const userId = user?._id || user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { shelterId, animalId } = (req.body || {}) as { shelterId?: string; animalId?: string };
  const normalizedShelter = normalizeId(shelterId);
  if (!normalizedShelter) {
    return res.status(400).json({ error: 'invalid_shelter_id' });
  }

  const shelter = await User.findOne({ _id: normalizedShelter, role: 'landlord' }).select('patitas');
  if (!shelter) {
    return res.status(404).json({ error: 'protectora_not_found' });
  }

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

  await PatitaLog.create({
    shelterId: normalizedShelter,
    userId,
    animalId: normalizeId(animalId),
    amount: 1,
    source: 'click',
  });

  const newBalance = updated?.patitas ?? (shelter.patitas || 0) + 1;
  return res.json({ ok: true, newBalance });
}

function resolveShelterTarget(user: any, provided?: string) {
  if (user?.role === 'landlord') {
    return String(user._id || user.id || '');
  }
  if (user?.role === 'admin' && provided) {
    return provided;
  }
  return undefined;
}

export async function spendPatitas(req: Request, res: Response) {
  const actor: any = (req as any).user;
  if (!actor) return res.status(401).json({ error: 'unauthorized' });

  const { amount, partnerType, concept, shelterId, animalId, couponId } = (req.body || {}) as {
    amount?: number;
    partnerType?: 'store' | 'vet';
    concept?: string;
    shelterId?: string;
    animalId?: string;
    couponId?: string;
  };

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'invalid_amount' });
  }

  if (!['store', 'vet'].includes(String(partnerType))) {
    return res.status(400).json({ error: 'invalid_partner_type' });
  }

  const trimmedConcept = (concept || '').trim();
  if (!trimmedConcept) {
    return res.status(400).json({ error: 'concept_required' });
  }

  let coupon: any;
  if (couponId) {
    if (!isValidObjectId(couponId)) {
      return res.status(400).json({ error: 'invalid_coupon' });
    }
    coupon = await Coupon.findById(couponId).lean();
    if (!coupon) {
      return res.status(404).json({ error: 'coupon_not_found' });
    }
    if (coupon.partnerType !== partnerType) {
      return res.status(400).json({ error: 'coupon_partner_mismatch' });
    }
    if (coupon.targetAnimalCode && !animalId) {
      return res.status(400).json({ error: 'coupon_requires_animal' });
    }
    if (coupon.usedAt) {
      return res.status(400).json({ error: 'coupon_already_used' });
    }
    if (!coupon.active) {
      return res.status(400).json({ error: 'coupon_inactive' });
    }
    if (coupon.expiresAt && coupon.expiresAt <= new Date()) {
      return res.status(400).json({ error: 'coupon_expired' });
    }
  }

  const targetShelter = resolveShelterTarget(actor, normalizeId(shelterId));
  if (!targetShelter) {
    return res.status(400).json({ error: 'invalid_shelter_context' });
  }

  const shelter = await User.findOne({ _id: targetShelter, role: 'landlord' }).select('patitas');
  if (!shelter) {
    return res.status(404).json({ error: 'protectora_not_found' });
  }

  const current = shelter.patitas || 0;
  if (current < numericAmount) {
    return res.status(400).json({ error: 'insufficient_patitas', available: current });
  }

  const updated = await User.findOneAndUpdate(
    { _id: targetShelter, role: 'landlord' },
    { $inc: { patitas: -numericAmount } },
    { new: true },
  ).select('patitas');

  await PatitaLog.create({
    shelterId: targetShelter,
    userId: String(actor._id || actor.id || targetShelter),
    animalId: normalizeId(animalId),
    amount: -numericAmount,
    source: partnerType,
    concept: trimmedConcept,
    couponId: coupon?._id,
  });

  return res.json({ ok: true, newBalance: updated?.patitas ?? current - numericAmount });
}

export async function listPendingPatitas(_req: Request, res: Response) {
  const user: any = (_req as any).user;
  if (!user || !['store', 'vet', 'admin'].includes(user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const filter: any = {
    source: { $in: ['store', 'vet'] },
    proofImageUrl: { $exists: false },
  };
  if (user.role === 'store') filter.source = 'store';
  if (user.role === 'vet') filter.source = 'vet';
  const logs = await PatitaLog.find(filter)
    .sort({ createdAt: -1 })
    .lean();
  const animalIds = logs.map(log => log.animalId).filter(Boolean) as any[];
  const animals = animalIds.length
    ? await Animal.find({ _id: { $in: animalIds } }).select('name species images code').lean()
    : [];
  const map = new Map(animals.map(a => [String(a._id), a]));
  const couponIds = logs.map(log => log.couponId).filter(Boolean) as any[];
  const coupons = couponIds.length
    ? await Coupon.find({ _id: { $in: couponIds } }).select('title discount targetAnimalCode partnerType bonusPatitas').lean()
    : [];
  const couponMap = new Map(coupons.map(c => [String(c._id), { ...c, _id: String(c._id) }]));
  res.json({
    items: logs.map(log => ({
      ...log,
      id: String(log._id),
      animal: log.animalId ? map.get(String(log.animalId)) || null : null,
      couponId: log.couponId ? String(log.couponId) : undefined,
      coupon: log.couponId ? couponMap.get(String(log.couponId)) || null : null,
    })),
  });
}

export async function confirmPatita(req: Request, res: Response) {
  const user: any = (req as any).user;
  if (!user || !['store', 'vet', 'admin'].includes(user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { logId, proofImageUrl, notes, treatmentType } = (req.body || {}) as {
    logId?: string;
    proofImageUrl?: string;
    notes?: string;
    treatmentType?: string;
  };
  if (!logId || !isValidObjectId(logId)) {
    return res.status(400).json({ error: 'invalid_log' });
  }
  if (!proofImageUrl || typeof proofImageUrl !== 'string') {
    return res.status(400).json({ error: 'proof_required' });
  }
  const log = await PatitaLog.findById(logId);
  if (!log) return res.status(404).json({ error: 'log_not_found' });
  if (!['store', 'vet'].includes(log.source)) {
    return res.status(400).json({ error: 'log_not_confirmable' });
  }
  if (user.role === 'store' && log.source !== 'store') {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (user.role === 'vet' && log.source !== 'vet') {
    return res.status(403).json({ error: 'forbidden' });
  }

  if (log.source === 'vet') {
    if (!treatmentType || !treatmentType.trim()) {
      return res.status(400).json({ error: 'treatment_required_for_vet' });
    }
  } else if (log.source === 'store' && treatmentType && treatmentType.trim()) {
    return res.status(400).json({ error: 'treatment_not_allowed_for_store' });
  }

  let relatedAnimal = log.animalId ? await Animal.findById(log.animalId) : null;

  let coupon: any;
  if (log.couponId) {
    coupon = await Coupon.findById(log.couponId).lean();
    if (!coupon) {
      return res.status(404).json({ error: 'coupon_not_found' });
    }
    if (coupon.partnerType !== log.source) {
      return res.status(400).json({ error: 'coupon_partner_mismatch' });
    }
    if (coupon.targetAnimalCode) {
      if (!log.animalId) {
        return res.status(400).json({ error: 'coupon_requires_animal' });
      }
      if (!relatedAnimal) {
        relatedAnimal = await Animal.findById(log.animalId);
      }
      if (!relatedAnimal) {
        return res.status(404).json({ error: 'animal_not_found' });
      }
      const code = relatedAnimal.code || (await ensureAnimalCode(relatedAnimal));
      if (!code) {
        return res.status(400).json({ error: 'animal_code_missing' });
      }
      if (code !== coupon.targetAnimalCode) {
        return res.status(400).json({ error: 'coupon_animal_mismatch', expectedCode: coupon.targetAnimalCode, animalCode: code });
      }
    }
  }

  log.proofImageUrl = proofImageUrl;
  log.partnerNotes = typeof notes === 'string' ? notes.trim() : undefined;
  log.treatmentType = typeof treatmentType === 'string' ? treatmentType.trim() : undefined;
  log.confirmedAt = new Date();
  log.confirmedBy = user._id || user.id;
  await log.save();

  if (log.source === 'vet' && log.treatmentType && log.animalId) {
    await Animal.findByIdAndUpdate(log.animalId, {
      $push: {
        healthHistory: {
          date: new Date(),
          type: log.treatmentType,
          notes: log.partnerNotes,
          vetId: user._id || user.id,
        },
      },
    });
  }

  let couponDonation: { amount: number; shelterId: string; shelterName?: string } | undefined;
  if (coupon && PLATFORM_RATE > 0 && DONATION_SHARE > 0) {
    const baseAmount = Math.abs(Number(log.amount) || 0);
    if (baseAmount > 0) {
      const fee = roundCurrency(baseAmount * PLATFORM_RATE);
      const donationAmount = roundCurrency(fee * DONATION_SHARE);
      if (donationAmount > 0) {
        const relatedShelter = relatedAnimal?.shelter ? String(relatedAnimal.shelter) : undefined;
        const donationShelterId = relatedShelter || (log.shelterId ? String(log.shelterId) : undefined);
        if (donationShelterId) {
          const updatedShelter = await User.findOneAndUpdate(
            { _id: donationShelterId, role: { $in: ['landlord', 'protectora'] } },
            { $inc: { patitas: donationAmount } },
            { new: true },
          ).select('name');
          if (updatedShelter) {
            await PatitaLog.create({
              shelterId: donationShelterId,
              userId: log.userId,
              animalId: log.animalId,
              amount: donationAmount,
              source: 'coupon_bonus',
              concept: coupon?.copy ? `Bonus cupón ${coupon.copy}` : coupon?.title ? `Bonus cupón ${coupon.title}` : 'Bonus cupón',
              couponId: log.couponId,
            });
            couponDonation = {
              amount: donationAmount,
              shelterId: String(updatedShelter._id),
              shelterName: updatedShelter.name || undefined,
            };
          }
        }
      }
    }
  }

  res.json({ ok: true, couponDonation });
}
