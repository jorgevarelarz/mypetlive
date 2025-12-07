import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { Animal } from '../models/animal.model';
import { User } from '../models/user.model';
import { PatitaLog } from '../models/patitaLog.model';

const DEFAULT_PURCHASE_RATE = 0.08;

function resolveRate() {
  const envRate = Number(process.env.PURCHASE_PATITAS_RATE);
  if (Number.isFinite(envRate) && envRate > 0) return envRate;
  return DEFAULT_PURCHASE_RATE;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export async function recordPurchase(req: Request, res: Response) {
  const actor: any = (req as any).user;
  if (!actor || !['store', 'vet'].includes(actor.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const { animalId, amount, notes } = (req.body || {}) as {
    animalId?: string;
    amount?: number;
    notes?: string;
  };

  if (!animalId || !isValidObjectId(animalId)) {
    return res.status(400).json({ error: 'invalid_animal' });
  }
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'invalid_amount' });
  }

  const animal = await Animal.findById(animalId).select('shelter code name');
  if (!animal) {
    return res.status(404).json({ error: 'animal_not_found' });
  }

  const shelterId = animal.shelter ? String(animal.shelter) : undefined;
  if (!shelterId || !isValidObjectId(shelterId)) {
    return res.status(400).json({ error: 'protectora_not_found' });
  }

  const rate = resolveRate();
  const patitasAmount = roundCurrency(numericAmount * rate);

  const protectora = await User.findOneAndUpdate(
    { _id: shelterId, role: { $in: ['landlord', 'protectora'] } },
    { $inc: { patitas: patitasAmount } },
    { new: true },
  ).select('_id');

  if (!protectora) {
    return res.status(400).json({ error: 'protectora_not_found' });
  }

  await PatitaLog.create({
    shelterId,
    userId: actor._id || actor.id,
    partnerId: actor._id || actor.id,
    animalId,
    amount: patitasAmount,
    source: 'purchase',
    concept: 'Registro de compra',
    partnerNotes: typeof notes === 'string' && notes.trim() ? notes.trim() : undefined,
  });

  res.status(201).json({ ok: true });
}
