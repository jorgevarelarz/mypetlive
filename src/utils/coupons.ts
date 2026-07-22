import { Animal } from '../models/animal.model';
import { Coupon } from '../models/coupon.model';
import { purchasedItemNames, itemsMatch } from './purchases';

// Cupones de un partner aplicables a un cliente: activos, sin usar, no caducados
// y sin targeting de animal o dirigidos a una mascota del cliente. Si el cupón
// segmenta por items comprados (targetItems), se exige que el cliente los haya
// comprado en ESTE partner (su historial en otras tiendas no se expone aquí).
// Lo comparten el TPV (pos.controller) y el panel/caja del partner (patitas.controller).
export async function eligibleCoupons(partnerId: string, userId: string) {
  const codes = (await Animal.find({ ownerId: userId }).select('code').lean())
    .map((a: any) => a.code)
    .filter(Boolean);
  const now = new Date();
  const candidates = await Coupon.find({
    partnerId,
    active: true,
    usedAt: { $exists: false },
    $and: [
      { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }] },
      {
        $or: [
          { targetAnimalCode: { $exists: false } },
          { targetAnimalCode: null },
          ...(codes.length ? [{ targetAnimalCode: { $in: codes } }] : []),
        ],
      },
    ],
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!candidates.some((c: any) => c.targetItems?.length)) return candidates;
  const purchased = await purchasedItemNames(userId, { partnerId });
  return candidates.filter((c: any) => itemsMatch(c.targetItems, purchased));
}

export const serializeCoupon = (c: any) => ({
  _id: String(c._id),
  title: c.title || c.copy,
  discount: c.discount,
  bonusPatitas: c.bonusPatitas || 0,
  targetAnimalCode: c.targetAnimalCode || null,
});
