import { Router, Request, Response } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { searchPetProducts } from '../utils/petCatalog';

const r = Router();

// GET /api/catalog/pet-products?q=roy&kind=food&species=cat — autocompletado de
// comida y arena. Público: es una lista de nombres de producto, sin datos de nadie.
r.get('/pet-products', asyncHandler(async (req: Request, res: Response) => {
  const kind = req.query.kind === 'litter' ? 'litter' : 'food';
  const q = String(req.query.q || '').slice(0, 80);
  const species = typeof req.query.species === 'string' ? req.query.species : undefined;
  const items = await searchPetProducts(q, kind, species);
  res.json({ items: items.map((p: any) => ({ name: p.name, brand: p.brand || null })) });
}));

export default r;
