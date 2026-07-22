import { Request, Response } from 'express';
import { Coupon } from '../models/coupon.model';
import { Animal } from '../models/animal.model';
import { speciesVariants, speciesMatches } from '../utils/species';
import { purchasedItemNames, itemsMatch, matchedItems } from '../utils/purchases';
import { isStripeConfigured, getStripeClient } from '../utils/stripe';

// Precio del placement patrocinado (destacado) que paga el partner. Configurable.
const SPONSORED_PLACEMENT_EUR = Math.max(1, Number(process.env.SPONSORED_PLACEMENT_EUR ?? 9.99));

function serializeOffer(c: any) {
  return {
    _id: String(c._id),
    title: c.title || c.copy,
    description: c.description,
    discount: c.discount,
    serviceType: c.serviceType,
    bonusPatitas: c.bonusPatitas,
    partnerType: c.partnerType,
    partner: c.partnerId && c.partnerId._id ? { id: String(c.partnerId._id), name: c.partnerId.name } : undefined,
    sponsored: !!c.sponsored,
    targetAnimalCode: c.targetAnimalCode,
    expiresAt: c.expiresAt,
    exact: false as boolean,
  };
}

// La especie se guarda mezclada en datos legados (es/en: gato≡cat, perro≡dog);
// `speciesVariants`/`speciesMatches` (utils/species) casan ambos vocabularios.
// Casa las ofertas (cupones) con el perfil de un animal: especie/edad/tamaño/ciudad,
// o dirigidas exactamente a su código. Excluye cupones sin ningún targeting.
export async function matchOffersForAnimal(animal: any) {
  const now = new Date();
  const code = animal.code;
  const expiryOr = [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }];
  const targetOr: any[] = [{ targetAnimalCode: code }];
  if (animal.species) targetOr.push({ targetSpecies: { $in: speciesVariants(animal.species) } });
  if (animal.ageGroup) targetOr.push({ targetAgeGroup: animal.ageGroup });
  if (animal.size) targetOr.push({ targetSize: animal.size });
  if (animal.city) targetOr.push({ targetCity: { $regex: String(animal.city), $options: 'i' } });

  const candidates = await Coupon.find({
    active: true,
    usedAt: { $exists: false },
    $and: [{ $or: expiryOr }, { $or: targetOr }],
  }).populate('partnerId', 'name role').lean();

  const matched = candidates
    .map((c: any) => {
      // Las ofertas por items comprados exigen historial del usuario: nunca se
      // evalúan (ni muestran) en superficies sin usuario como el pasaporte público.
      if (c.targetItems?.length) return null;
      const exact = c.targetAnimalCode && c.targetAnimalCode === code;
      if (!exact) {
        // Refuerza: todos los criterios definidos deben casar (los vacíos no restringen).
        if (!speciesMatches(c.targetSpecies, animal.species)) return null;
        if (c.targetAgeGroup?.length && animal.ageGroup && !c.targetAgeGroup.includes(animal.ageGroup)) return null;
        if (c.targetAgeGroup?.length && !animal.ageGroup) return null;
        if (c.targetSize?.length && !c.targetSize.includes(animal.size)) return null;
        if (c.targetCity && !String(animal.city || '').toLowerCase().includes(String(c.targetCity).toLowerCase())) return null;
      }
      const o = serializeOffer(c);
      o.exact = !!exact;
      return o;
    })
    .filter(Boolean) as ReturnType<typeof serializeOffer>[];

  matched.sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.sponsored) - Number(a.sponsored));
  return matched;
}

// GET /api/offers/for-animal/:code
export async function offersForAnimal(req: Request, res: Response) {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'invalid_code' });
  const animal: any = await Animal.findOne({ code }).lean();
  if (!animal) return res.status(404).json({ error: 'not_found' });
  res.json({ animal: { code: animal.code, name: animal.name, species: animal.species }, items: await matchOffersForAnimal(animal) });
}

// POST /api/offers/coupons/:id/sponsor — el partner paga para destacar su cupón.
// Gateado por Stripe igual que el resto: sin clave configurada queda 'pending'
// (placement solicitado pero sin cobro), demoable sin pasarela real.
export async function sponsorCoupon(req: Request, res: Response) {
  const user: any = (req as any).user;
  const userId = String(user?._id || user?.id || '');
  const id = String(req.params.id || '');
  const coupon: any = await Coupon.findById(id);
  if (!coupon) return res.status(404).json({ error: 'not_found' });

  const isAdmin = user?.role === 'admin';
  const isOwner = String(coupon.partnerId || '') === userId;
  if (!isAdmin && !isOwner) return res.status(403).json({ error: 'forbidden' });

  if (coupon.sponsored && coupon.sponsorshipStatus === 'active') {
    return res.json({ status: 'active', sponsored: true, alreadyActive: true });
  }

  // Gateado: sin Stripe no se cobra; queda marcado como pendiente.
  if (!isStripeConfigured()) {
    coupon.sponsorshipStatus = 'pending';
    await coupon.save();
    return res.json({
      status: 'pending',
      configured: false,
      priceEur: SPONSORED_PLACEMENT_EUR,
      message: 'Pagos no disponibles todavía; placement marcado como pendiente.',
    });
  }

  const base = process.env.FRONTEND_URL?.replace(/\/$/, '') || process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:3001';
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: { name: `Placement destacado · ${coupon.copy || coupon.title || 'Cupón'}` },
          unit_amount: Math.round(SPONSORED_PLACEMENT_EUR * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { sponsoredCouponId: String(coupon._id), partnerId: String(coupon.partnerId || '') },
    success_url: base + '/?sponsor=success',
    cancel_url: base + '/?sponsor=cancel',
  });

  coupon.sponsorshipStatus = 'pending';
  await coupon.save();
  res.json({ status: 'pending', configured: true, id: session.id, url: session.url, priceEur: SPONSORED_PLACEMENT_EUR });
}

// GET /api/offers/for-me — unión de ofertas para las mascotas del usuario, más
// las segmentadas por sus compras (targetItems contra su historial de tickets).
export async function offersForMe(req: Request, res: Response) {
  const me = String((req as any).user?._id || (req as any).user?.id || '');
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  const pets: any[] = await Animal.find({ ownerId: me }).lean();
  const byId = new Map<string, any>();
  for (const pet of pets) {
    const offers = await matchOffersForAnimal(pet);
    for (const o of offers) {
      const existing = byId.get(o._id);
      if (existing) existing.pets.push({ code: pet.code, name: pet.name });
      else byId.set(o._id, { ...o, pets: [{ code: pet.code, name: pet.name }] });
    }
  }

  // Ofertas por items comprados: solo aquí (contexto privado del propio usuario).
  const purchased = await purchasedItemNames(me);
  if (purchased.length) {
    const now = new Date();
    const candidates = await Coupon.find({
      active: true,
      usedAt: { $exists: false },
      'targetItems.0': { $exists: true },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
    }).populate('partnerId', 'name role').lean();
    for (const c of candidates) {
      if (byId.has(String(c._id)) || !itemsMatch(c.targetItems, purchased)) continue;
      const o: any = serializeOffer(c);
      o.byItems = true;
      o.matchedItems = matchedItems(c.targetItems, purchased).slice(0, 3);
      o.pets = [];
      byId.set(o._id, o);
    }
  }

  const items = Array.from(byId.values()).sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.sponsored) - Number(a.sponsored));
  res.json({ items });
}
