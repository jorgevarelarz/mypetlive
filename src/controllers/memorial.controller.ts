import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Animal } from '../models/animal.model';
import { CareLog } from '../models/careLog.model';
import { MemorialMessage } from '../models/memorialMessage.model';
import { canManageAnimal } from '../utils/animalAccess';
import { sendPushToUser } from '../utils/push';
import logger from '../utils/logger';

// Mural «en su memoria» de una mascota fallecida.
//
// La familia la despide desde «Mi mascota»: se paran todos los avisos (los
// trabajos filtran `memorial.active`), se cierra el modo perdido y el QR de la
// chapa pasa a enseñar el mural. Las visitas pueden encender una vela o dejar
// unas palabras, que solo se publican si la familia quiere.

const MEDIA_URL = /\/uploads\/[\w-]+\.(webp|jpg|png|gif|mp4|mov)$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const FAVORITES = ['food', 'toy', 'place', 'nap', 'nicknames'] as const;

const text = (value: unknown, max: number) => {
  const t = typeof value === 'string' ? value.trim().replace(/\s+\n/g, '\n') : '';
  return t ? t.slice(0, max) : undefined;
};

async function manageable(req: Request, res: Response) {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  const animal: any = await Animal.findById(id);
  if (!animal) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  if (!canManageAnimal((req as any).user, animal)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return animal;
}

/** Lo que más se le apuntó de comer: la comida favorita, sin preguntar. */
async function mostLoggedFood(animalId: Types.ObjectId): Promise<string | undefined> {
  const [top] = await CareLog.aggregate([
    { $match: { animalId, type: 'feed', foods: { $exists: true, $ne: [] } } },
    // Se agrupa sin mayúsculas, pero se enseña como la escribieron la primera vez.
    { $sort: { createdAt: 1, _id: 1 } },
    { $unwind: '$foods' },
    { $group: { _id: { $toLower: '$foods' }, name: { $first: '$foods' }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 1 },
  ]);
  return top?.name;
}

/**
 * Sus números, sacados de lo que la familia apuntó. Solo los que tienen algo:
 * «0 paseos» en un mural no lo quiere ver nadie.
 */
export async function memorialStats(animal: any) {
  const [walks] = await CareLog.aggregate([
    { $match: { animalId: animal._id, type: 'walk' } },
    { $group: { _id: null, n: { $sum: 1 }, km: { $sum: { $ifNull: ['$walk.distanceKm', 0] } } } },
  ]);
  const feedings = await CareLog.countDocuments({ animalId: animal._id, type: 'feed' });
  const vaccines = (animal.healthHistory || []).filter((h: any) => h.type === 'vaccine').length;
  const end = animal.memorial?.diedAt ? new Date(animal.memorial.diedAt) : new Date();
  const years = animal.birthDate
    ? Math.floor((end.getTime() - new Date(animal.birthDate).getTime()) / (365.25 * 24 * 3_600_000))
    : null;

  const stats: Array<{ key: string; value: number; label: string }> = [];
  if (years && years > 0) stats.push({ key: 'years', value: years, label: years === 1 ? 'año de vida' : 'años de vida' });
  if (walks?.n) stats.push({ key: 'walks', value: walks.n, label: walks.n === 1 ? 'paseo apuntado' : 'paseos apuntados' });
  if (walks?.km >= 1) stats.push({ key: 'km', value: Math.round(walks.km), label: 'km andados juntos' });
  if (feedings) stats.push({ key: 'feedings', value: feedings, label: feedings === 1 ? 'comida apuntada' : 'comidas apuntadas' });
  if (vaccines) stats.push({ key: 'vaccines', value: vaccines, label: vaccines === 1 ? 'vacuna' : 'vacunas' });
  return stats;
}

/** El mural tal como se publica (sin mensajes: esos van aparte y filtrados). */
export function publicMemorial(animal: any) {
  const m = animal.memorial || {};
  return {
    active: Boolean(m.active),
    diedAt: m.diedAt || null,
    epitaph: m.epitaph || null,
    epitaphBy: m.epitaphBy || null,
    favorites: m.favorites || {},
    media: m.media || [],
    memories: [...(m.memories || [])].sort((a: any, b: any) => String(a.month || '').localeCompare(String(b.month || ''))),
    candles: m.candles || 0,
  };
}

// POST /api/animals/:id/memorial — la familia la despide.
export async function startMemorial(req: Request, res: Response) {
  const animal = await manageable(req, res);
  if (!animal) return;

  const diedAt = req.body?.diedAt ? new Date(req.body.diedAt) : undefined;
  if (diedAt && (Number.isNaN(diedAt.getTime()) || diedAt.getTime() > Date.now() + 24 * 3_600_000)) {
    return res.status(400).json({ error: 'invalid_date' });
  }

  const previous = animal.memorial?.toObject?.() || animal.memorial || {};
  const media = previous.media?.length
    ? previous.media
    : (animal.images || []).filter((url: string) => MEDIA_URL.test(url)).map((url: string) => ({ url, kind: 'image' }));
  const favorites = { ...(previous.favorites || {}) };
  if (!favorites.food) favorites.food = await mostLoggedFood(animal._id);

  animal.memorial = {
    ...previous,
    active: true,
    since: previous.since || new Date(),
    diedAt: diedAt || previous.diedAt,
    media,
    favorites,
  };
  // Si estaba perdida, el pasaporte deja de pedir avisos (y de enseñar el teléfono).
  if (animal.lost?.isLost) {
    animal.lost.isLost = false;
    animal.lost.contact = undefined;
  }
  // Sin evento en la línea de tiempo a propósito: si fue un error y se
  // deshace, un «nos dejó» no debe quedarse escrito en su pasaporte.
  await animal.save();
  res.json({ ok: true, memorial: publicMemorial(animal) });
}

// DELETE /api/animals/:id/memorial — «ha sido un error». Lo escrito se conserva.
export async function stopMemorial(req: Request, res: Response) {
  const animal = await manageable(req, res);
  if (!animal) return;
  if (animal.memorial) animal.memorial.active = false;
  await animal.save();
  res.json({ ok: true });
}

// PUT /api/animals/:id/memorial — unas palabras y sus cosas favoritas.
export async function updateMemorial(req: Request, res: Response) {
  const animal = await manageable(req, res);
  if (!animal) return;
  if (!animal.memorial?.active) return res.status(409).json({ error: 'not_memorial' });

  const body = req.body || {};
  if ('epitaph' in body) animal.memorial.epitaph = text(body.epitaph, 300);
  if ('epitaphBy' in body) animal.memorial.epitaphBy = text(body.epitaphBy, 120);
  if ('diedAt' in body) {
    const d = body.diedAt ? new Date(body.diedAt) : undefined;
    if (d && Number.isNaN(d.getTime())) return res.status(400).json({ error: 'invalid_date' });
    animal.memorial.diedAt = d;
  }
  if (body.favorites && typeof body.favorites === 'object') {
    const fav: Record<string, string | undefined> = {};
    for (const key of FAVORITES) fav[key] = text(body.favorites[key], 160);
    animal.memorial.favorites = fav;
  }
  await animal.save();
  res.json({ ok: true, memorial: publicMemorial(animal) });
}

// POST /api/animals/:id/memorial/media — { url, kind }: una foto o un vídeo ya subido.
export async function addMemorialMedia(req: Request, res: Response) {
  const animal = await manageable(req, res);
  if (!animal) return;
  if (!animal.memorial?.active) return res.status(409).json({ error: 'not_memorial' });
  const url = String(req.body?.url || '');
  if (!MEDIA_URL.test(url)) return res.status(400).json({ error: 'invalid_media' });
  const kind = /\.(mp4|mov)$/i.test(url) ? 'video' : 'image';
  if (!animal.memorial.media.some((m: any) => m.url === url)) {
    if (animal.memorial.media.length >= 120) return res.status(400).json({ error: 'too_many_media' });
    animal.memorial.media.unshift({ url, kind });
  }
  await animal.save();
  res.json({ ok: true, memorial: publicMemorial(animal) });
}

// DELETE /api/animals/:id/memorial/media — { url }
export async function removeMemorialMedia(req: Request, res: Response) {
  const animal = await manageable(req, res);
  if (!animal) return;
  if (!animal.memorial?.active) return res.status(409).json({ error: 'not_memorial' });
  const url = String(req.body?.url || '');
  animal.memorial.media = animal.memorial.media.filter((m: any) => m.url !== url);
  await animal.save();
  res.json({ ok: true, memorial: publicMemorial(animal) });
}

// POST /api/animals/:id/memorial/memories — { month?, text, photo? }
export async function addMemory(req: Request, res: Response) {
  const animal = await manageable(req, res);
  if (!animal) return;
  if (!animal.memorial?.active) return res.status(409).json({ error: 'not_memorial' });
  const body = req.body || {};
  const memoryText = text(body.text, 1000);
  if (!memoryText) return res.status(400).json({ error: 'empty_memory' });
  const month = body.month ? String(body.month) : undefined;
  if (month && !MONTH.test(month)) return res.status(400).json({ error: 'invalid_month' });
  const photo = body.photo ? String(body.photo) : undefined;
  if (photo && !MEDIA_URL.test(photo)) return res.status(400).json({ error: 'invalid_media' });
  if (animal.memorial.memories.length >= 100) return res.status(400).json({ error: 'too_many_memories' });
  animal.memorial.memories.push({ month, text: memoryText, photo });
  await animal.save();
  res.status(201).json({ ok: true, memorial: publicMemorial(animal) });
}

// DELETE /api/animals/:id/memorial/memories/:memoryId
export async function removeMemory(req: Request, res: Response) {
  const animal = await manageable(req, res);
  if (!animal) return;
  if (!animal.memorial?.active) return res.status(409).json({ error: 'not_memorial' });
  animal.memorial.memories = animal.memorial.memories.filter((m: any) => String(m._id) !== req.params.memoryId);
  await animal.save();
  res.json({ ok: true, memorial: publicMemorial(animal) });
}

// GET /api/animals/:id/memorial — la vista de la familia: todo, mensajes incluidos.
export async function getMemorialForFamily(req: Request, res: Response) {
  const animal = await manageable(req, res);
  if (!animal) return;
  const [messages, stats] = await Promise.all([
    MemorialMessage.find({ animalId: animal._id }).sort({ createdAt: -1 }).limit(300).lean(),
    memorialStats(animal),
  ]);
  res.json({ memorial: publicMemorial(animal), stats, messages, code: animal.code || null });
}

// PATCH /api/animals/:id/memorial/messages/:messageId — { status: 'published' | 'private' | 'pending' }
export async function setMessageStatus(req: Request, res: Response) {
  const animal = await manageable(req, res);
  if (!animal) return;
  const status = String(req.body?.status || '');
  if (!['published', 'private', 'pending'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
  if (!Types.ObjectId.isValid(req.params.messageId)) return res.status(404).json({ error: 'not_found' });
  const msg = await MemorialMessage.findOneAndUpdate(
    { _id: req.params.messageId, animalId: animal._id },
    { status },
    { new: true },
  ).lean();
  if (!msg) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, message: msg });
}

// DELETE /api/animals/:id/memorial/messages/:messageId — borrarlo del todo.
export async function deleteMessage(req: Request, res: Response) {
  const animal = await manageable(req, res);
  if (!animal) return;
  if (!Types.ObjectId.isValid(req.params.messageId)) return res.status(404).json({ error: 'not_found' });
  await MemorialMessage.deleteOne({ _id: req.params.messageId, animalId: animal._id });
  res.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Público (desde el QR, sin sesión). Van limitados por IP en la ruta.
// ---------------------------------------------------------------------------

async function memorialByCode(code: string) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;
  const animal: any = await Animal.findOne({ code: normalized, 'memorial.active': true });
  return animal;
}

// POST /api/animals/passport/:code/candle
export async function lightCandle(req: Request, res: Response) {
  const animal = await memorialByCode(req.params.code);
  if (!animal) return res.status(404).json({ error: 'not_found' });
  const updated: any = await Animal.findByIdAndUpdate(animal._id, { $inc: { 'memorial.candles': 1 } }, { new: true })
    .select('memorial.candles')
    .lean();
  res.json({ ok: true, candles: updated?.memorial?.candles || 0 });
}

// POST /api/animals/passport/:code/memorial-message — { name, text }
export async function leaveMessage(req: Request, res: Response) {
  const animal = await memorialByCode(req.params.code);
  if (!animal) return res.status(404).json({ error: 'not_found' });
  const name = text(req.body?.name, 80);
  const body = text(req.body?.text, 600);
  if (!name || !body) return res.status(400).json({ error: 'missing_fields' });

  // Tope de pendientes: sin él, un bucle llena la bandeja de la familia en un
  // momento en que no está para limpiar spam.
  const pending = await MemorialMessage.countDocuments({ animalId: animal._id, status: 'pending' });
  if (pending >= 50) return res.status(429).json({ error: 'too_many_pending' });

  await MemorialMessage.create({ animalId: animal._id, name, text: body });

  // La familia se entera para poder publicarlo. Sin texto del mensaje en la
  // notificación: se lee con calma dentro, no en la pantalla bloqueada.
  if (animal.ownerId) {
    void sendPushToUser(String(animal.ownerId), {
      title: `Unas palabras para ${animal.name}`,
      body: `${name} ha dejado un mensaje en su mural.`,
      url: `/pet?mascota=${animal._id}`,
    }).catch(err => logger.error({ err }, '[mural] fallo al avisar del mensaje'));
  }
  res.status(201).json({ ok: true });
}

/** Mensajes publicados, para el pasaporte. */
export async function publishedMessages(animalId: Types.ObjectId) {
  return MemorialMessage.find({ animalId, status: 'published' })
    .sort({ createdAt: -1 })
    .limit(100)
    .select('name text createdAt')
    .lean();
}
