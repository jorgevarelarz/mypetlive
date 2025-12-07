import { Request, Response } from 'express';
import { Animal } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';

async function authorizeCare(animalId: string, user: any) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const animal = await Animal.findById(animalId).select('shelter').lean();
  if (!animal) return false;
  if (user.role === 'landlord' && String(animal.shelter) === String(user._id || user.id)) return true;
  if (user.role === 'tenant') {
    const adoption = await Adoption.findOne({ animalId: String(animalId), adopterId: String(user._id || user.id), status: 'accepted' });
    if (adoption) return true;
  }
  return false;
}

export async function markFeeding(req: Request, res: Response) {
  const { id } = req.params;
  const user: any = (req as any).user;
  const allowed = await authorizeCare(id, user);
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  const updated = await Animal.findByIdAndUpdate(id, { lastFeeding: new Date() }, { new: true }).lean();
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, lastFeeding: updated.lastFeeding });
}

export async function markLitter(req: Request, res: Response) {
  const { id } = req.params;
  const user: any = (req as any).user;
  const allowed = await authorizeCare(id, user);
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  const updated = await Animal.findByIdAndUpdate(id, { lastLitterChange: new Date() }, { new: true }).lean();
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, lastLitterChange: updated.lastLitterChange });
}
