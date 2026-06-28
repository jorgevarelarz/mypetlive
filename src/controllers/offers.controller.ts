import { Request, Response } from 'express';
import { Coupon } from '../models/coupon.model';
import { Animal } from '../models/animal.model';

function serializeOffer(c: any) {
  return {
    _id: String(c._id),
    title: c.title || c.copy,
    description: c.description,
    discount: c.discount,
    bonusPatitas: c.bonusPatitas,
    partnerType: c.partnerType,
    partner: c.partnerId && c.partnerId._id ? { id: String(c.partnerId._id), name: c.partnerId.name } : undefined,
    sponsored: !!c.sponsored,
    targetAnimalCode: c.targetAnimalCode,
    expiresAt: c.expiresAt,
    exact: false as boolean,
  };
}

// La especie se guarda mezclada (es/en: gato≡cat, perro≡dog). Normaliza para que
// el targeting case sin importar el vocabulario del animal o del cupón.
const SPECIES_SYNONYMS: Record<string, string[]> = {
  cat: ['cat', 'gato'],
  gato: ['cat', 'gato'],
  dog: ['dog', 'perro'],
  perro: ['dog', 'perro'],
};
function speciesVariants(value?: string): string[] {
  if (!value) return [];
  const k = String(value).toLowerCase();
  return SPECIES_SYNONYMS[k] || [k];
}
function speciesMatches(target: string[] | undefined, animalSpecies?: string): boolean {
  if (!target?.length) return true; // vacío no restringe
  const variants = speciesVariants(animalSpecies);
  return target.some(s => variants.includes(String(s).toLowerCase()));
}

// Casa las ofertas (cupones) con el perfil de un animal: especie/edad/tamaño/ciudad,
// o dirigidas exactamente a su código. Excluye cupones sin ningún targeting.
async function matchOffersForAnimal(animal: any) {
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

// GET /api/offers/for-me — unión de ofertas para las mascotas del usuario.
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
  const items = Array.from(byId.values()).sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.sponsored) - Number(a.sponsored));
  res.json({ items });
}
