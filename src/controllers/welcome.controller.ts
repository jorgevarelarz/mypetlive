import { Request, Response } from 'express';
import { WelcomePlan, WELCOME_TASKS, WELCOME_TASK_KEYS } from '../models/welcomePlan.model';

function serializePlan(plan: any) {
  const done = new Map<string, Date>(
    (plan.tasks || []).filter((t: any) => t.doneAt).map((t: any) => [t.key, t.doneAt]),
  );
  const tasks = WELCOME_TASKS.map(def => ({
    ...def,
    done: done.has(def.key),
    doneAt: done.get(def.key) || null,
  }));
  return {
    id: String(plan._id),
    animalId: String(plan.animalId),
    activatedAt: plan.activatedAt,
    tasks,
    progress: { done: tasks.filter(t => t.done).length, total: tasks.length },
  };
}

// GET /api/welcome/:animalId — plan de bienvenida de una mascota del usuario.
export async function getPlan(req: Request, res: Response) {
  const user: any = (req as any).user;
  const userId = user?._id || user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const plan = await WelcomePlan.findOne({ animalId: req.params.animalId }).lean();
  if (!plan) return res.status(404).json({ error: 'not_found' });
  if (user?.role !== 'admin' && String(plan.ownerId) !== String(userId)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json(serializePlan(plan));
}

// POST /api/welcome/:animalId/tasks/:key — marca/desmarca una tarea del plan.
export async function toggleTask(req: Request, res: Response) {
  const user: any = (req as any).user;
  const userId = user?._id || user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const key = String(req.params.key || '');
  if (!WELCOME_TASK_KEYS.includes(key)) return res.status(400).json({ error: 'invalid_task' });

  const plan = await WelcomePlan.findOne({ animalId: req.params.animalId });
  if (!plan) return res.status(404).json({ error: 'not_found' });
  if (user?.role !== 'admin' && String(plan.ownerId) !== String(userId)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const existing = plan.tasks.find(t => t.key === key);
  if (existing) {
    existing.doneAt = existing.doneAt ? undefined : new Date();
  } else {
    plan.tasks.push({ key, doneAt: new Date() });
  }
  plan.markModified('tasks');
  await plan.save();
  res.json(serializePlan(plan.toObject()));
}
