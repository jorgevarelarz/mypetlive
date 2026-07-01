import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Adoption } from '../models/adoption.model';
import { Animal, ensureAnimalCode } from '../models/animal.model';
import { User } from '../models/user.model';
import { sendEmail } from '../utils/notification';
import { Questionnaire } from '../models/questionnaire.model';
import { logAnimalEvent } from '../utils/animalEvents';

export async function create(req: Request, res: Response) {
  const userId = (req as any).user?._id || (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const { animalId, message, answers } = req.body as {
    animalId: string;
    message?: string;
    answers?: Array<{ question?: string; answer?: string }>;
  };

  const animal = await Animal.findById(animalId).lean();
  if (!animal) return res.status(404).json({ error: 'animal_not_found' });
  if (animal.isPersonalPet === true || animal.createdByRole !== 'protectora') {
    return res.status(400).json({ error: 'animal_not_available' });
  }
  if (animal.status !== 'publicado') return res.status(400).json({ error: 'animal_not_available' });

  let requiredQuestions: string[] = [];
  if (animal.shelter) {
    const questionnaire = await Questionnaire.findOne({ protectoraId: animal.shelter }).lean();
    if (questionnaire?.questions?.length) {
      requiredQuestions = questionnaire.questions.filter(q => typeof q === 'string' && q.trim());
    }
  }

  let normalizedAnswers: { question: string; answer: string }[] = [];
  if (requiredQuestions.length) {
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'answers_required' });
    }
    const answerMap = new Map<string, string>();
    for (const entry of answers) {
      const question = typeof entry?.question === 'string' ? entry.question.trim() : '';
      const answerText = typeof entry?.answer === 'string' ? entry.answer.trim() : '';
      if (question) {
        answerMap.set(question, answerText);
      }
    }
    const missing = requiredQuestions.find(q => !answerMap.get(q));
    if (missing) {
      return res.status(400).json({ error: 'answers_incomplete' });
    }
    normalizedAnswers = requiredQuestions.map(question => ({ question, answer: answerMap.get(question) || '' }));
  }

  const exists = await Adoption.findOne({ animalId: String(animal._id), adopterId: String(userId) });
  if (exists) return res.json({ ok: true, id: exists._id, status: exists.status });

  const created = await Adoption.create({
    animalId: String(animal._id),
    adopterId: String(userId),
    status: 'recibida',
    answers: normalizedAnswers,
    history: [
      { action: 'created' },
      ...(message ? [{ action: 'message', payload: { message: message.slice(0, 500) } }] : []),
    ],
  });
  res.status(201).json({ ok: true, id: created._id, status: created.status });
}

export async function listMine(req: Request, res: Response) {
  const userId = (req as any).user?._id || (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const { page = '1', limit = '20' } = req.query as any;
  const pg = Math.max(1, parseInt(String(page), 10) || 1);
  const lim = Math.min(50, Math.max(1, parseInt(String(limit), 10) || 10));

  const filter = { adopterId: String(userId) };
  const [items, total] = await Promise.all([
    Adoption.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    Adoption.countDocuments(filter),
  ]);

  const ids = [...new Set(items.map(i => i.animalId))];
  const animals = await Animal.find({ _id: { $in: ids } }).select('name species breed images status shelter code').lean();
  const map = new Map(animals.map(a => [String(a._id), a]));

  res.json({
    items: items.map(i => ({
      id: String(i._id),
      status: i.status,
      createdAt: i.createdAt,
      animal: map.get(i.animalId) || null,
      answers: i.answers || [],
    })),
    page: pg,
    limit: lim,
    total,
  });
}

export async function listForMyAnimals(req: Request, res: Response) {
  const userId = (req as any).user?._id || (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const { page = '1', limit = '20', status } = req.query as any;
  const pg = Math.max(1, parseInt(String(page), 10) || 1);
  const lim = Math.min(50, Math.max(1, parseInt(String(limit), 10) || 10));

  const myAnimals = await Animal.find({ shelter: userId }).select('_id').lean();
  if (myAnimals.length === 0) return res.json({ items: [], page: pg, limit: lim, total: 0 });
  const ids = myAnimals.map(a => String(a._id));
  const filter: any = { animalId: { $in: ids } };
  if (status) filter.status = String(status);

  const [items, total] = await Promise.all([
    Adoption.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    Adoption.countDocuments(filter),
  ]);

  const animalIds = [...new Set(items.map(i => i.animalId))];
  const adoptersIds = [...new Set(items.map(i => i.adopterId))];

  const [animals, adopters] = await Promise.all([
    animalIds.length ? Animal.find({ _id: { $in: animalIds } }).select('name species images status age code').lean() : [],
    adoptersIds.length ? User.find({ _id: { $in: adoptersIds } }).select('name email').lean() : [],
  ]);

  const animalMap = new Map(animals.map(a => [String(a._id), a]));
  const adopterMap = new Map(adopters.map(a => [String(a._id), { _id: String(a._id), name: a.name, email: a.email }]));

  res.json({
    items: items.map(i => ({
      id: String(i._id),
      status: i.status,
      createdAt: i.createdAt,
      animal: animalMap.get(i.animalId) || null,
      adopter: adopterMap.get(i.adopterId) || null,
      answers: i.answers || [],
    })),
    page: pg,
    limit: lim,
    total,
  });
}

// Etiquetas legibles para el correo al adoptante.
const STATUS_LABEL_ES: Record<string, string> = {
  recibida: 'recibida',
  cuestionario_pendiente: 'cuestionario pendiente',
  en_revision: 'en revisión',
  info_adicional: 'pendiente de información adicional',
  cita_propuesta: 'cita propuesta',
  preaprobada: 'preaprobada',
  aprobada: 'aprobada',
  rechazada: 'rechazada',
  cancelada: 'cancelada',
};

export async function setStatus(req: Request, res: Response) {
  const userId = (req as any).user?._id || (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const { id } = req.params;
  const { status, note } = req.body as { status: import('../models/adoption.model').AdoptionStatus; note?: string };

  const app = await Adoption.findById(id);
  if (!app) return res.status(404).json({ error: 'not_found' });

  // Ensure this adoption belongs to an animal of the shelter
  const animal = await Animal.findById(app.animalId);
  if (!animal) return res.status(404).json({ error: 'animal_not_found' });
  const user: any = (req as any).user;
  const isAdmin = user?.role === 'admin';
  if (!isAdmin && String(animal.shelter) !== String(userId)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  app.status = status;
  app.history = app.history || [];
  app.history.push({
    ts: new Date(),
    actorId: String(userId),
    action: 'status_change',
    payload: { status, ...(note ? { note: note.slice(0, 1000) } : {}) },
  });
  await app.save();

  if (status === 'aprobada') {
    // Cierre de adopción: la mascota pasa a ser del adoptante (conserva su código).
    const previousShelter = animal.shelter ? String(animal.shelter) : undefined;
    if (app.adopterId) {
      animal.ownerId = new Types.ObjectId(String(app.adopterId));
    }
    animal.createdByRole = 'tenant';
    animal.isPersonalPet = true;
    animal.status = 'adoptado';
    await animal.save();
    await logAnimalEvent({
      animalId: String(animal._id), code: animal.code, type: 'adopted',
      actorId: String((req as any).user?._id || (req as any).user?.id || ''),
      fromOwnerId: previousShelter, fromOwnerType: 'protectora',
      toOwnerId: app.adopterId ? String(app.adopterId) : undefined, toOwnerType: 'tenant',
      shelterId: previousShelter, data: { adoptionId: String(app._id) },
    });
  } else if (['preaprobada', 'cita_propuesta'].includes(status) && animal.status === 'publicado') {
    // Proceso avanzado: el animal deja de estar libremente disponible.
    animal.status = 'reservado';
    await animal.save();
    await logAnimalEvent({ animalId: String(animal._id), code: animal.code, type: 'reserved', shelterId: animal.shelter ? String(animal.shelter) : undefined });
  } else if ((status === 'rechazada' || status === 'cancelada') && animal.status === 'reservado') {
    // Se libera de nuevo si el proceso se detiene.
    animal.status = 'publicado';
    await animal.save();
    await logAnimalEvent({ animalId: String(animal._id), code: animal.code, type: 'returned', shelterId: animal.shelter ? String(animal.shelter) : undefined });
  }

  try {
    const adopter = await User.findById(app.adopterId);
    if (adopter?.email) {
      const subject = status === 'aprobada' ? '¡Tu adopción ha sido aprobada!' : 'Estado de tu solicitud de adopción';
      const msg = status === 'aprobada'
        ? `¡Enhorabuena! La protectora ha aprobado tu adopción para ${animal.name}.`
        : `La protectora ha actualizado el estado de tu solicitud para ${animal.name} a: ${STATUS_LABEL_ES[status] || status}.`;
      await sendEmail(adopter.email, subject, msg);
    }
  } catch {}
  res.json({ ok: true, id: app._id, status: app.status });
}

// El adoptante retira su propia solicitud (o el admin). Solo desde estados no
// terminales; libera al animal si estaba reservado por este proceso.
export async function cancelByAdopter(req: Request, res: Response) {
  const user: any = (req as any).user;
  const userId = user?._id || user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const { id } = req.params;
  const { note } = (req.body || {}) as { note?: string };

  const app = await Adoption.findById(id);
  if (!app) return res.status(404).json({ error: 'not_found' });

  const isAdmin = user?.role === 'admin';
  const isAdopter = String(app.adopterId) === String(userId);
  if (!isAdmin && !isAdopter) return res.status(403).json({ error: 'forbidden' });

  if (['aprobada', 'rechazada', 'cancelada'].includes(app.status)) {
    return res.status(400).json({ error: 'already_closed' });
  }

  app.status = 'cancelada';
  app.history = app.history || [];
  app.history.push({
    ts: new Date(),
    actorId: String(userId),
    action: 'status_change',
    payload: { status: 'cancelada', by: 'adopter', ...(note ? { note: note.slice(0, 1000) } : {}) },
  });
  await app.save();

  const animal = await Animal.findById(app.animalId);
  if (animal && animal.status === 'reservado') {
    // Se libera de nuevo al retirarse el proceso.
    animal.status = 'publicado';
    await animal.save();
    await logAnimalEvent({ animalId: String(animal._id), code: animal.code, type: 'returned', shelterId: animal.shelter ? String(animal.shelter) : undefined });
  }

  // Aviso a la protectora de que el adoptante retiró la solicitud.
  try {
    if (animal?.shelter) {
      const shelter = await User.findById(animal.shelter);
      if (shelter?.email) {
        await sendEmail(shelter.email, 'Solicitud de adopción cancelada', `El adoptante ha retirado su solicitud de adopción para ${animal.name}.`);
      }
    }
  } catch {}

  res.json({ ok: true, id: app._id, status: app.status });
}

export async function listAll(_req: Request, res: Response) {
  const { page = '1', limit = '20', status } = _req.query as any;
  const pg = Math.max(1, parseInt(String(page), 10) || 1);
  const lim = Math.min(50, Math.max(1, parseInt(String(limit), 10) || 10));
  const filter: any = {};
  if (status) filter.status = String(status);
  const [items, total] = await Promise.all([
    Adoption.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    Adoption.countDocuments(filter),
  ]);
  res.json({ items, page: pg, limit: lim, total });
}

export async function getById(req: Request, res: Response) {
  const { id } = req.params;
  const app = await Adoption.findById(id).lean();
  if (!app) return res.status(404).json({ error: 'not_found' });
  const animalDoc = app.animalId ? await Animal.findById(app.animalId) : null;
  if (animalDoc && !animalDoc.code) {
    await ensureAnimalCode(animalDoc);
  }
  const animal = animalDoc ? animalDoc.toObject() : null;
  const user: any = (req as any).user;
  const isAdmin = user?.role === 'admin';
  const isAdopter = String(app.adopterId) === String(user?._id || user?.id);
  const isShelter = animal && String(animal.shelter) === String(user?._id || user?.id);
  if (!isAdmin && !isAdopter && !isShelter) return res.status(403).json({ error: 'forbidden' });
  res.json({ ...app, animal });
}
