import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Adoption } from '../models/adoption.model';
import { Animal, ensureAnimalCode } from '../models/animal.model';
import { User } from '../models/user.model';
import { sendEmail } from '../utils/notification';
import { Questionnaire } from '../models/questionnaire.model';

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
  if (animal.status !== 'available') return res.status(400).json({ error: 'animal_not_available' });

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
    status: 'pending',
    answers: normalizedAnswers,
    history: message ? [{ action: 'message', payload: { message: message.slice(0, 500) } }] : [],
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

export async function setStatus(req: Request, res: Response) {
  const userId = (req as any).user?._id || (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const { id } = req.params;
  const { status } = req.body as { status: 'accepted' | 'rejected' };

  const app = await Adoption.findById(id);
  if (!app) return res.status(404).json({ error: 'not_found' });

  // Ensure this adoption belongs to an animal of the shelter
  const animal = await Animal.findById(app.animalId);
  if (!animal) return res.status(404).json({ error: 'animal_not_found' });
  if (String(animal.shelter) !== String(userId)) return res.status(403).json({ error: 'forbidden' });

  app.status = status;
  app.history = app.history || [];
  app.history.push({ ts: new Date(), actorId: String(userId), action: 'status_change', payload: { status } });
  await app.save();

  if (status === 'accepted') {
    if (app.adopterId) {
      animal.ownerId = new Types.ObjectId(String(app.adopterId));
    }
    animal.createdByRole = 'tenant';
    animal.isPersonalPet = true;
    animal.status = 'adopted';
    await animal.save();
  } else if (animal.status !== 'adopted') {
    await animal.save();
  }
  try {
    const adopter = await User.findById(app.adopterId);
    if (adopter?.email) {
      const subject = status === 'accepted' ? '¡Tu adopción ha sido aceptada!' : 'Estado de tu solicitud de adopción';
      const msg = status === 'accepted'
        ? `¡Enhorabuena! La protectora ha aceptado tu adopción para ${animal.name}.`
        : `La protectora ha actualizado el estado de tu solicitud para ${animal.name} a: ${status}.`;
      await sendEmail(adopter.email, subject, msg);
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
