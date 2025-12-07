import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Questionnaire } from '../models/questionnaire.model';

function ensureProtectora(user: any) {
  if (!user || !['landlord', 'protectora', 'admin'].includes(user.role)) {
    return null;
  }
  return user.role === 'admin' ? null : user._id || user.id;
}

export async function getMine(req: Request, res: Response) {
  const user: any = (req as any).user;
  const protectoraId = ensureProtectora(user);
  if (!protectoraId) return res.status(403).json({ error: 'forbidden' });
  const doc = await Questionnaire.findOne({ protectoraId }).lean();
  res.json({ questions: doc?.questions || [] });
}

export async function setMine(req: Request, res: Response) {
  const user: any = (req as any).user;
  const protectoraId = ensureProtectora(user);
  if (!protectoraId) return res.status(403).json({ error: 'forbidden' });
  const questions = Array.isArray((req.body as any)?.questions)
    ? (req.body as any).questions.map((q: any) => String(q || '').trim()).filter(Boolean)
    : [];
  const doc = await Questionnaire.findOneAndUpdate(
    { protectoraId },
    { protectoraId, questions },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  res.json({ questions: doc.questions });
}

export async function getByProtectora(req: Request, res: Response) {
  const { protectoraId } = req.params;
  if (!protectoraId || !mongoose.Types.ObjectId.isValid(protectoraId)) {
    return res.status(400).json({ error: 'invalid_protectora' });
  }
  const doc = await Questionnaire.findOne({ protectoraId }).lean();
  res.json({ questions: doc?.questions || [] });
}
