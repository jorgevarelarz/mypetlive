import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Animal } from '../models/animal.model';
import { AnimalFavorite } from '../models/animalFavorite.model';
import { getUserId } from '../utils/getUserId';

export async function list(req: Request, res: Response) {
  const userId = getUserId(req);
  const favorites = await AnimalFavorite.find({ userId }).sort({ createdAt: -1 }).lean();
  const animalIds = favorites.map(item => item.animalId);
  const animals = animalIds.length
    ? await Animal.find({
        _id: { $in: animalIds },
        createdByRole: 'protectora',
        isPersonalPet: { $ne: true },
      }).lean()
    : [];
  const byId = new Map(animals.map(animal => [String(animal._id), animal]));
  res.json({
    ids: favorites.map(item => String(item.animalId)),
    items: favorites.map(item => byId.get(String(item.animalId))).filter(Boolean),
  });
}

export async function add(req: Request, res: Response) {
  const userId = getUserId(req);
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid_animal_id' });
  const animal = await Animal.findOne({
    _id: id,
    createdByRole: 'protectora',
    isPersonalPet: { $ne: true },
  }).select('_id');
  if (!animal) return res.status(404).json({ error: 'not_found' });
  await AnimalFavorite.updateOne({ userId, animalId: id }, {}, { upsert: true });
  res.status(201).json({ ok: true, animalId: id });
}

export async function addMany(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(getUserId(req));
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map(String).filter(mongoose.isValidObjectId))]
    : [];
  if (!ids.length) return res.json({ ok: true, added: 0 });
  const animals = await Animal.find({
    _id: { $in: ids },
    createdByRole: 'protectora',
    isPersonalPet: { $ne: true },
  }).select('_id').lean();
  if (animals.length) {
    await AnimalFavorite.bulkWrite(
      animals.map(animal => ({
        updateOne: {
          filter: { userId, animalId: animal._id },
          update: { $setOnInsert: { userId, animalId: animal._id } },
          upsert: true,
        },
      })),
    );
  }
  res.json({ ok: true, added: animals.length });
}

export async function remove(req: Request, res: Response) {
  const userId = getUserId(req);
  await AnimalFavorite.deleteOne({ userId, animalId: req.params.id });
  res.json({ ok: true });
}
