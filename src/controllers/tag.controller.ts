import { Request, Response } from 'express';
import { Tag, generateTags, normalizeTagCode, tagStatus } from '../models/tag.model';
import { Animal } from '../models/animal.model';
import { canManageAnimal } from '../utils/animalAccess';
import { logAnimalEvent } from '../utils/animalEvents';

// ---------------------------------------------------------------------------
// Chapas físicas del collar
//
// El recorrido real es este: alguien escanea el QR grabado en el metal, cae en
// `/t/:code`, y a partir de ahí solo hay dos mundos posibles.
//
//   - La chapa ya está asignada  →  su pasaporte, `/p/:animalCode`. Es el caso
//     de quien se encuentra al animal por la calle, así que tiene que
//     funcionar SIN cuenta y sin fricción.
//   - La chapa está vacía        →  "dime el código de tu mascota". Es el caso
//     del dueño estrenando el collar, que sí tiene cuenta porque el animal ya
//     existe en la app.
// ---------------------------------------------------------------------------

// GET /api/tags/:code — público. Es lo primero que se ejecuta al escanear.
export async function resolveTag(req: Request, res: Response) {
  const code = normalizeTagCode(req.params.code);
  if (!code) return res.status(400).json({ error: 'invalid_code' });

  const tag: any = await Tag.findOne({ code });
  if (!tag) return res.status(404).json({ error: 'tag_not_found' });

  // Contador de escaneos. Es `updateOne` y no `tag.save()` para no pisar una
  // asignación concurrente: dos móviles escaneando a la vez no deben poder
  // revertir el `animalId` que acaba de escribir el dueño.
  await Tag.updateOne({ _id: tag._id }, { $inc: { scans: 1 }, $set: { lastScanAt: new Date() } });

  const status = tagStatus(tag);
  if (status === 'anulada') return res.status(410).json({ error: 'tag_revoked', status });
  if (status === 'libre') return res.json({ status, code: tag.code });

  // Solo se devuelve el código del animal: la redirección al pasaporte la hace
  // el front, y es `getPassport` quien decide qué datos son públicos. Aquí no
  // se replica esa decisión (un segundo sitio que elige qué exponer es un
  // segundo sitio donde se puede filtrar algo).
  const animal: any = await Animal.findById(tag.animalId).select('code name').lean();
  if (!animal) {
    // La ficha se borró pero la chapa sigue existiendo en el collar. Se trata
    // como libre para que se pueda reutilizar en vez de quedar muerta.
    return res.json({ status: 'libre', code: tag.code });
  }

  return res.json({ status, code: tag.code, animal: { code: animal.code, name: animal.name } });
}

// POST /api/tags/:code/claim — el dueño casa la chapa con su animal.
// Body: { animalCode }.
export async function claimTag(req: Request, res: Response) {
  const code = normalizeTagCode(req.params.code);
  const animalCode = normalizeTagCode((req.body || {}).animalCode);
  if (!code) return res.status(400).json({ error: 'invalid_code' });
  if (!animalCode) return res.status(400).json({ error: 'animal_code_required' });

  const tag: any = await Tag.findOne({ code });
  if (!tag) return res.status(404).json({ error: 'tag_not_found' });
  if (tag.revokedAt) return res.status(410).json({ error: 'tag_revoked' });
  if (tag.animalId) return res.status(409).json({ error: 'tag_already_claimed' });

  const animal: any = await Animal.findOne({ code: animalCode });
  if (!animal) return res.status(404).json({ error: 'animal_not_found' });

  // Sin esto, cualquiera con una chapa en blanco podría apuntarla al animal de
  // otro: los códigos de animal son NOMBRE-NNN y solo tienen 900 variantes por
  // nombre, así que se adivinan. Exigir que seas quien lo gestiona cierra eso.
  const user = (req as any).user;
  if (!canManageAnimal(user, animal)) return res.status(403).json({ error: 'forbidden' });

  // Un animal, una chapa. Si no, un pasaporte acabaría con tres collares
  // repartidos y ninguna forma de saber cuál está en el cuello del perro.
  const existing = await Tag.findOne({ animalId: animal._id, revokedAt: null });
  if (existing) return res.status(409).json({ error: 'animal_already_tagged' });

  const actorId = String(user?._id || user?.id || '');

  // Escritura condicionada a que siga libre: dos peticiones simultáneas con la
  // misma chapa (doble toque en el botón) no pueden asignarla dos veces.
  const claimed = await Tag.findOneAndUpdate(
    { _id: tag._id, animalId: null, revokedAt: null },
    { $set: { animalId: animal._id, claimedBy: actorId || null, claimedAt: new Date() } },
    { new: true },
  );
  if (!claimed) return res.status(409).json({ error: 'tag_already_claimed' });

  await logAnimalEvent({
    animalId: String(animal._id),
    code: animal.code,
    type: 'status',
    actorId,
    data: { tag: tag.code, action: 'tag_claimed' },
  });

  return res.status(201).json({
    ok: true,
    status: 'vinculada',
    code: tag.code,
    animal: { code: animal.code, name: animal.name },
  });
}

// POST /api/tags/:code/release — desvincula para poder reutilizar la chapa.
export async function releaseTag(req: Request, res: Response) {
  const code = normalizeTagCode(req.params.code);
  if (!code) return res.status(400).json({ error: 'invalid_code' });

  const tag: any = await Tag.findOne({ code });
  if (!tag) return res.status(404).json({ error: 'tag_not_found' });
  if (!tag.animalId) return res.status(409).json({ error: 'tag_not_claimed' });

  const animal: any = await Animal.findById(tag.animalId);
  const user = (req as any).user;
  // Si la ficha del animal ya no existe no hay a quién preguntar por el
  // permiso, así que solo el admin puede liberar la chapa.
  const allowed = animal ? canManageAnimal(user, animal) : user?.role === 'admin';
  if (!allowed) return res.status(403).json({ error: 'forbidden' });

  tag.animalId = null;
  tag.claimedBy = null;
  tag.claimedAt = null;
  await tag.save();

  if (animal) {
    await logAnimalEvent({
      animalId: String(animal._id),
      code: animal.code,
      type: 'status',
      actorId: String(user?._id || user?.id || ''),
      data: { tag: tag.code, action: 'tag_released' },
    });
  }

  return res.json({ ok: true, status: 'libre', code: tag.code });
}

// GET /api/tags/mine — las chapas que ha asignado el usuario.
export async function listMyTags(req: Request, res: Response) {
  const user = (req as any).user;
  const uid = String(user?._id || user?.id || '');
  if (!uid) return res.status(401).json({ error: 'unauthorized' });

  const tags = await Tag.find({ claimedBy: uid, revokedAt: null })
    .populate('animalId', 'code name images')
    .sort({ claimedAt: -1 })
    .lean();

  return res.json({
    items: tags.map((t: any) => ({
      code: t.code,
      claimedAt: t.claimedAt,
      scans: t.scans,
      lastScanAt: t.lastScanAt,
      animal: t.animalId ? { code: t.animalId.code, name: t.animalId.name, images: t.animalId.images || [] } : null,
    })),
  });
}

// ---------------------------------------------------------------------------
// Admin: fabricación de lotes
// ---------------------------------------------------------------------------

// POST /api/admin/tags/batch — genera el lote que se manda a imprimir.
export async function createTagBatch(req: Request, res: Response) {
  const body = req.body || {};
  const count = Number(body.count);
  const batch = String(body.batch || '').trim();
  const prefix = String(body.prefix || 'MPL').trim();

  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    return res.status(400).json({ error: 'invalid_count' });
  }
  if (!batch) return res.status(400).json({ error: 'batch_required' });
  if (!/^[A-Za-z0-9-]{1,12}$/.test(prefix)) return res.status(400).json({ error: 'invalid_prefix' });

  const existing = await Tag.countDocuments({ batch });
  if (existing) return res.status(409).json({ error: 'batch_exists', existing });

  const created = await generateTags({ count, batch, prefix });
  return res.status(201).json({ ok: true, batch, count: created.length, codes: created.map((t: any) => t.code) });
}

// GET /api/admin/tags/batch/:batch.csv — el fichero que se le pasa al proveedor.
// Dos columnas: lo que va grabado en texto y lo que codifica el QR.
export async function exportTagBatch(req: Request, res: Response) {
  const batch = String(req.params.batch || '').replace(/\.csv$/i, '').trim();
  if (!batch) return res.status(400).json({ error: 'batch_required' });

  const tags = await Tag.find({ batch }).sort({ createdAt: 1 }).lean();
  if (!tags.length) return res.status(404).json({ error: 'batch_not_found' });

  const base = (process.env.FRONTEND_URL || 'https://mypetlive.es').replace(/\/$/, '');
  const rows = [['codigo', 'url'], ...tags.map((t: any) => [t.code, `${base}/t/${t.code}`])];
  const csv = rows.map((r) => r.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="chapas-${batch}.csv"`);
  return res.send(csv);
}

// GET /api/admin/tags — estado de la flota de chapas, por lote.
export async function listTagBatches(_req: Request, res: Response) {
  const batches = await Tag.aggregate([
    {
      $group: {
        _id: '$batch',
        total: { $sum: 1 },
        vinculadas: { $sum: { $cond: [{ $ne: ['$animalId', null] }, 1, 0] } },
        anuladas: { $sum: { $cond: [{ $ne: ['$revokedAt', null] }, 1, 0] } },
        escaneos: { $sum: '$scans' },
        createdAt: { $min: '$createdAt' },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  return res.json({
    items: batches.map((b: any) => ({
      batch: b._id,
      total: b.total,
      vinculadas: b.vinculadas,
      libres: b.total - b.vinculadas - b.anuladas,
      anuladas: b.anuladas,
      escaneos: b.escaneos,
      createdAt: b.createdAt,
    })),
  });
}

// POST /api/admin/tags/:code/revoke — matar una chapa perdida o defectuosa.
export async function revokeTag(req: Request, res: Response) {
  const code = normalizeTagCode(req.params.code);
  const tag: any = await Tag.findOne({ code });
  if (!tag) return res.status(404).json({ error: 'tag_not_found' });

  tag.revokedAt = new Date();
  tag.animalId = null;
  tag.claimedBy = null;
  tag.claimedAt = null;
  await tag.save();

  return res.json({ ok: true, status: 'anulada', code: tag.code });
}
