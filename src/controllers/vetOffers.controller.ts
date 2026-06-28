import { Request, Response } from 'express';
import { Coupon } from '../models/coupon.model';

function actorId(req: Request) {
  const u: any = (req as any).user || {};
  return String(u._id || u.id || '');
}

function toStrArray(value: any): string[] {
  if (Array.isArray(value)) return value.map(v => String(v).trim().toLowerCase()).filter(Boolean).slice(0, 20);
  if (typeof value === 'string' && value.trim()) return value.split(',').map(v => v.trim().toLowerCase()).filter(Boolean).slice(0, 20);
  return [];
}

function serialize(c: any) {
  return {
    _id: String(c._id),
    copy: c.copy,
    discount: c.discount,
    serviceType: c.serviceType,
    targetSpecies: c.targetSpecies || [],
    targetAgeGroup: c.targetAgeGroup || [],
    targetSize: c.targetSize || [],
    targetCity: c.targetCity,
    sponsored: !!c.sponsored,
    active: c.active,
    expiresAt: c.expiresAt,
    usedAt: c.usedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// GET /api/vet/offers — ofertas (cupones) propias del veterinario.
export async function listVetOffers(req: Request, res: Response) {
  const vetId = actorId(req);
  const items = await Coupon.find({ partnerId: vetId }).sort({ createdAt: -1 }).lean();
  res.json({ items: items.map(serialize) });
}

// POST /api/vet/offers — el veterinario crea una oferta de servicio propia.
export async function createVetOffer(req: Request, res: Response) {
  const vetId = actorId(req);
  const b: any = req.body || {};
  const copy = typeof b.copy === 'string' ? b.copy.trim() : '';
  const discount = typeof b.discount === 'string' ? b.discount.trim() : '';
  if (!copy) return res.status(400).json({ error: 'copy_required' });
  if (!discount) return res.status(400).json({ error: 'discount_required' });

  let expiresAt: Date | undefined;
  if (b.expiresAt) {
    const parsed = new Date(b.expiresAt);
    if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'invalid_expiration' });
    expiresAt = parsed;
  }

  const coupon = await Coupon.create({
    partnerId: vetId,
    partnerType: 'vet',
    copy,
    title: copy,
    discount,
    serviceType: typeof b.serviceType === 'string' && b.serviceType.trim() ? b.serviceType.trim() : undefined,
    targetSpecies: toStrArray(b.targetSpecies),
    targetAgeGroup: toStrArray(b.targetAgeGroup),
    targetSize: toStrArray(b.targetSize),
    targetCity: typeof b.targetCity === 'string' && b.targetCity.trim() ? b.targetCity.trim() : undefined,
    expiresAt,
    active: true,
  });
  res.status(201).json(serialize(coupon));
}

async function ownedCoupon(req: Request, res: Response) {
  const vetId = actorId(req);
  const coupon: any = await Coupon.findById(req.params.id);
  if (!coupon) { res.status(404).json({ error: 'not_found' }); return null; }
  if (String(coupon.partnerId || '') !== vetId) { res.status(403).json({ error: 'forbidden' }); return null; }
  return coupon;
}

// PATCH /api/vet/offers/:id/toggle — activa/desactiva una oferta propia.
export async function toggleVetOffer(req: Request, res: Response) {
  const coupon = await ownedCoupon(req, res);
  if (!coupon) return;
  coupon.active = !coupon.active;
  await coupon.save();
  res.json(serialize(coupon));
}

// DELETE /api/vet/offers/:id — elimina una oferta propia (si no se ha usado).
export async function deleteVetOffer(req: Request, res: Response) {
  const coupon = await ownedCoupon(req, res);
  if (!coupon) return;
  if (coupon.usedAt) return res.status(409).json({ error: 'already_used' });
  await coupon.deleteOne();
  res.json({ ok: true });
}
