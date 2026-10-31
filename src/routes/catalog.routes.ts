import { Router, Request, Response } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { findByBarcode, searchPetProducts, teachBarcode } from '../utils/petCatalog';
import { authenticate } from '../middleware/auth.middleware';

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

// GET /api/catalog/pet-products/barcode/:code — lector de código de barras.
r.get('/pet-products/barcode/:code', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const product: any = await findByBarcode(String(req.params.code));
  if (!product) return res.status(404).json({ error: 'unknown_barcode' });
  res.json({ name: product.name, kind: product.kind, brand: product.brand || null });
}));

// POST /api/catalog/pet-products/barcode/:code { name, kind, species } — enseña
// un código que no conocía nadie, con el nombre que ha escrito la persona.
r.post('/pet-products/barcode/:code', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const kind = req.body?.kind === 'litter' ? 'litter' : 'food';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (name.length < 2) return res.status(400).json({ error: 'name_required' });
  const product: any = await teachBarcode(String(req.params.code), name, kind, req.body?.species);
  if (!product) return res.status(400).json({ error: 'invalid_barcode' });
  res.json({ name: product.name, kind: product.kind });
}));

export default r;
