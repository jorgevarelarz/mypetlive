import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Adoption } from '../models/adoption.model';
import { Animal, ensureAnimalCode } from '../models/animal.model';
import { User } from '../models/user.model';
import { sendEmail } from '../utils/notification';
import { Questionnaire } from '../models/questionnaire.model';
import { logAnimalEvent } from '../utils/animalEvents';
import { activateWelcomePlan } from '../utils/welcomePlan';
import { WelcomePlan } from '../models/welcomePlan.model';
import { canTransitionAdoption, isTerminalAdoptionStatus, nextAdoptionStatuses, TERMINAL_ADOPTION_STATUSES } from '../utils/adoptionTransitions';
import {
  UNDO_APPROVAL_WINDOW_HOURS,
  STATUS_BEFORE_APPROVAL,
  findApprovalTimestamp,
  hoursSince,
  statusBeforeAutoClose,
} from '../utils/adoptionUndo';
import logger from '../utils/logger';

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

  // Aviso a la protectora de la nueva candidatura. Best-effort: nunca rompe el alta.
  try {
    if (animal.shelter) {
      const [shelter, adopter] = await Promise.all([
        User.findById(animal.shelter).select('email').lean(),
        User.findById(userId).select('name').lean(),
      ]);
      if ((shelter as any)?.email) {
        const baseUrl = process.env.FRONTEND_URL || 'https://mypetlive.es';
        await sendEmail(
          (shelter as any).email,
          `Nueva solicitud de adopción para ${animal.name}`,
          `${(adopter as any)?.name || 'Un adoptante'} ha enviado una solicitud de adopción para ${animal.name}.\n` +
            `Revísala en tu panel: ${baseUrl}/landlord/adoptions`,
        );
      }
    }
  } catch {}

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

// Hasta `limit` animales publicados parecidos al dado (misma especie; prioriza
// mismo tamaño y ciudad) para sugerir alternativas cuando se rechaza una solicitud.
async function findSimilarAnimals(animal: any, limit = 3) {
  const base: any = {
    status: 'publicado',
    isPersonalPet: { $ne: true },
    species: animal.species,
  };
  // De más a menos parecido; los niveles sin criterios extra repiten la query
  // anterior pero el $nin de ya-encontrados los hace inocuos.
  const tiers = [
    { ...base, ...(animal.size ? { size: animal.size } : {}), ...(animal.city ? { city: animal.city } : {}) },
    { ...base, ...(animal.city ? { city: animal.city } : {}) },
    base,
  ];
  const found: any[] = [];
  for (const filter of tiers) {
    if (found.length >= limit) break;
    const batch = await Animal.find({ ...filter, _id: { $nin: [animal._id, ...found.map(f => f._id)] } })
      .select('name city')
      .sort({ createdAt: -1 })
      .limit(limit - found.length)
      .lean();
    found.push(...batch);
  }
  return found;
}

/**
 * Cierra el resto de candidaturas abiertas del mismo animal cuando una se
 * aprueba. Sin esto quedaban vivas para siempre: contaban como "en proceso" en
 * el panel de la protectora y esas personas nunca recibían una respuesta, aunque
 * el animal ya tuviera hogar.
 *
 * Es best-effort a propósito: la adopción aprobada ya está guardada y el traspaso
 * hecho, así que un fallo aquí no puede tumbar la respuesta.
 */
async function closeSiblingApplications(approved: any, animal: any, actorId: string) {
  try {
    const siblings = await Adoption.find({
      animalId: String(animal._id),
      _id: { $ne: approved._id },
      status: { $nin: TERMINAL_ADOPTION_STATUSES },
    });
    if (!siblings.length) return;

    const similars = await findSimilarAnimals(animal);
    const baseUrl = process.env.FRONTEND_URL || 'https://mypetlive.es';
    const suggestions = similars.length
      ? `\n\nEstos compañeros parecidos siguen buscando hogar:\n` +
        similars.map(s => `- ${s.name}${s.city ? ` (${s.city})` : ''}: ${baseUrl}/animals/${s._id}`).join('\n')
      : '';

    for (const sibling of siblings) {
      // `previousStatus` no es decorativo: si luego se deshace la aprobación,
      // es lo que devuelve a cada candidatura al punto donde estaba.
      const previousStatus = sibling.status;
      sibling.status = 'rechazada';
      sibling.history = sibling.history || [];
      sibling.history.push({
        ts: new Date(),
        actorId,
        action: 'status_change',
        payload: { status: 'rechazada', reason: 'animal_adopted', adoptionId: String(approved._id), previousStatus },
      });
      await sibling.save();

      const adopter = await User.findById(sibling.adopterId).select('email').lean();
      if (!adopter?.email) continue;
      await sendEmail(
        adopter.email,
        'Tu solicitud de adopción se ha cerrado',
        `${animal.name} ya ha encontrado hogar, así que cerramos tu solicitud. Gracias por querer adoptar.${suggestions}`,
      );
    }
  } catch (error) {
    logger.error({ err: error, animalId: String(animal._id) }, '[adopciones] no se pudieron cerrar las candidaturas hermanas');
  }
}

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

  // La transición tiene que ser legal. Antes se aceptaba cualquier estado del
  // enum viniera de donde viniera, así que una adopción ya aprobada se podía
  // pasar a 'rechazada' sin deshacer el traspaso del animal. El admin no está
  // exento: el destrozo en los datos es el mismo desde su panel.
  if (!canTransitionAdoption(app.status, status)) {
    return res.status(409).json({
      error: isTerminalAdoptionStatus(app.status) ? 'adoption_already_closed' : 'invalid_transition',
      from: app.status,
      to: status,
      allowed: nextAdoptionStatuses(app.status),
    });
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

  // Al adjudicar el animal, el resto de candidaturas dejan de tener sentido:
  // quedaban abiertas para siempre, contando como "en proceso" en el panel de la
  // protectora y dejando a esas personas esperando una respuesta que no llegaba.
  if (status === 'aprobada') {
    await closeSiblingApplications(app, animal, String(userId));
  }

  try {
    const adopter = await User.findById(app.adopterId);
    if (status === 'aprobada') {
      // Plan de bienvenida post-adopción: checklist + email con guía y ofertas.
      await activateWelcomePlan({
        animal,
        adopterId: String(app.adopterId),
        adoptionId: String(app._id),
        adopterEmail: adopter?.email,
      });
    } else if (adopter?.email) {
      const subject = 'Estado de tu solicitud de adopción';
      let msg = `La protectora ha actualizado el estado de tu solicitud para ${animal.name} a: ${STATUS_LABEL_ES[status] || status}.`;
      // Al rechazar, sugerimos animales parecidos para que el adoptante siga buscando.
      if (status === 'rechazada') {
        const similars = await findSimilarAnimals(animal);
        if (similars.length) {
          const baseUrl = process.env.FRONTEND_URL || 'https://mypetlive.es';
          msg +=
            `\n\nNo te desanimes: estos compañeros parecidos siguen buscando hogar:\n` +
            similars.map(s => `- ${s.name}${s.city ? ` (${s.city})` : ''}: ${baseUrl}/animals/${s._id}`).join('\n');
        }
      }
      await sendEmail(adopter.email, subject, msg);
    }
  } catch {}
  res.json({ ok: true, id: app._id, status: app.status });
}

/**
 * Reabre las candidaturas que se cerraron solas al adjudicar el animal.
 *
 * Las cerró un automatismo nuestro, no una decisión de la protectora, así que al
 * revertir vuelven a donde estaban y se avisa: esas personas recibieron un "ya
 * encontró hogar" que ha dejado de ser verdad.
 *
 * Best-effort, como el cierre: la reversión ya está guardada y un fallo de correo
 * no puede tumbar la respuesta.
 */
async function reopenSiblingApplications(approved: any, animal: any, actorId: string) {
  try {
    const siblings = await Adoption.find({
      animalId: String(animal._id),
      _id: { $ne: approved._id },
      status: 'rechazada',
      'history.payload.adoptionId': String(approved._id),
    });

    const baseUrl = process.env.FRONTEND_URL || 'https://mypetlive.es';
    let reopened = 0;

    for (const sibling of siblings) {
      const closedByUs = (sibling.history || []).some(
        entry =>
          entry?.action === 'status_change' &&
          (entry.payload as any)?.reason === 'animal_adopted' &&
          String((entry.payload as any)?.adoptionId) === String(approved._id),
      );
      if (!closedByUs) continue;

      sibling.status = statusBeforeAutoClose(sibling.history, String(approved._id));
      sibling.history = sibling.history || [];
      sibling.history.push({
        ts: new Date(),
        actorId,
        action: 'status_change',
        payload: { status: sibling.status, reason: 'adoption_reverted', adoptionId: String(approved._id) },
      });
      await sibling.save();
      reopened += 1;

      const adopter = await User.findById(sibling.adopterId).select('email').lean();
      if (!adopter?.email) continue;
      await sendEmail(
        adopter.email,
        'Tu solicitud de adopción vuelve a estar abierta',
        `Te escribimos para corregir el aviso anterior: la adopción de ${animal.name} no ha seguido adelante, ` +
          `así que tu solicitud vuelve a estar en marcha.\n\n${baseUrl}/animals/${animal._id}`,
      );
    }
    return reopened;
  } catch (error) {
    logger.error({ err: error, animalId: String(animal._id) }, '[adopciones] no se pudieron reabrir las candidaturas hermanas');
    return 0;
  }
}

/**
 * Deshace una aprobación: devuelve el animal a la protectora y la solicitud a
 * `preaprobada`.
 *
 * No es un cambio de estado más y por eso no pasa por `setStatus`: aprobar tiene
 * cinco efectos (traspaso del animal, evento de linaje, cierre de las
 * candidaturas hermanas, plan de bienvenida y correo) y deshacer tiene que
 * deshacer los cinco. Pasarlo por la máquina de estados habría exigido abrir
 * `aprobada`, y entonces cualquier otro camino de salida —a `rechazada`, por
 * ejemplo— volvería a dejar al animal traspasado con la solicitud rechazada.
 *
 * El evento `adopted` del linaje NO se borra: se compensa con uno de vuelta. Un
 * pasaporte que se reescribe deja de ser un pasaporte.
 */
export async function undoApproval(req: Request, res: Response) {
  const user: any = (req as any).user;
  const userId = user?._id || user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const { id } = req.params;
  const { reason } = (req.body || {}) as { reason?: string };

  const app = await Adoption.findById(id);
  if (!app) return res.status(404).json({ error: 'not_found' });

  const animal = await Animal.findById(app.animalId);
  if (!animal) return res.status(404).json({ error: 'animal_not_found' });

  const isAdmin = user?.role === 'admin';
  if (!isAdmin && String(animal.shelter) !== String(userId)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  if (app.status !== 'aprobada') {
    return res.status(409).json({ error: 'not_approved', status: app.status });
  }

  // El motivo es obligatorio y queda en el historial: esta operación mueve la
  // propiedad de un ser vivo y tiene que poder explicarse meses después.
  const trimmedReason = String(reason || '').trim();
  if (trimmedReason.length < 3) return res.status(400).json({ error: 'reason_required' });

  // Si el animal ya no está a nombre del adoptante, alguien lo ha movido después
  // (transferencia, otra adopción). Revertir aquí pisaría esa historia.
  if (app.adopterId && animal.ownerId && String(animal.ownerId) !== String(app.adopterId)) {
    return res.status(409).json({ error: 'animal_moved_on' });
  }

  const approvedAt = findApprovalTimestamp(app.history) || app.updatedAt;
  const elapsedHours = approvedAt ? hoursSince(new Date(approvedAt)) : 0;
  if (!isAdmin && elapsedHours > UNDO_APPROVAL_WINDOW_HOURS) {
    return res.status(403).json({
      error: 'undo_window_expired',
      windowHours: UNDO_APPROVAL_WINDOW_HOURS,
      approvedAt,
    });
  }

  const adopterId = app.adopterId ? String(app.adopterId) : undefined;
  const shelterId = animal.shelter ? String(animal.shelter) : undefined;

  // 1. El animal vuelve a la protectora. `reservado` y no `publicado`: que
  //    regrese al escaparate lo decide ella, no nosotros.
  if (shelterId) animal.ownerId = new Types.ObjectId(shelterId);
  animal.createdByRole = 'protectora';
  animal.isPersonalPet = false;
  animal.status = 'reservado';
  await animal.save();

  // 2. Linaje: evento de vuelta, sin tocar el 'adopted' anterior.
  await logAnimalEvent({
    animalId: String(animal._id), code: animal.code, type: 'returned',
    actorId: String(userId),
    fromOwnerId: adopterId, fromOwnerType: 'tenant',
    toOwnerId: shelterId, toOwnerType: 'protectora',
    shelterId,
    data: { adoptionId: String(app._id), reason: trimmedReason, undo: true },
  });

  // 3. La solicitud vuelve al único estado desde el que se pudo aprobar.
  app.status = STATUS_BEFORE_APPROVAL;
  app.history = app.history || [];
  app.history.push({
    ts: new Date(),
    actorId: String(userId),
    action: 'undo_approval',
    payload: {
      status: STATUS_BEFORE_APPROVAL,
      from: 'aprobada',
      reason: trimmedReason.slice(0, 1000),
      by: isAdmin ? 'admin' : 'shelter',
      hoursSinceApproval: Math.round(elapsedHours * 10) / 10,
    },
  });
  await app.save();

  // 4. El plan de bienvenida se retira entero: sus tareas hablaban de una
  //    convivencia que no ha empezado.
  if (adopterId) {
    try {
      await WelcomePlan.deleteOne({ animalId: animal._id, ownerId: new Types.ObjectId(adopterId) });
    } catch (err) {
      logger.error({ err, animalId: String(animal._id) }, '[adopciones] no se pudo retirar el plan de bienvenida');
    }
  }

  // 5. Las candidaturas hermanas vuelven a la vida.
  const reopened = await reopenSiblingApplications(app, animal, String(userId));

  // 6. El adoptante se entera por nosotros, no por encontrarse la ficha cambiada.
  try {
    const adopter = adopterId ? await User.findById(adopterId).select('email').lean() : null;
    if (adopter?.email) {
      await sendEmail(
        adopter.email,
        `Se ha revertido la adopción de ${animal.name}`,
        `La protectora ha deshecho la aprobación de tu adopción de ${animal.name}, así que vuelve a estar a su cargo ` +
          `y tu solicitud queda de nuevo como preaprobada.\n\nMotivo indicado: ${trimmedReason}\n\n` +
          `Si crees que se trata de un error, respóndeles desde el chat de la solicitud.`,
      );
    }
  } catch {}

  res.json({ ok: true, id: app._id, status: app.status, reopenedApplications: reopened });
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

  // El panel de admin pintaba `animalId` y `adopterId` crudos: dos columnas de
  // ObjectIds con las que no se puede trabajar. En el modelo son String sin
  // `ref`, así que populate no sirve y el join se hace aquí (dos consultas por
  // página, no una por fila).
  const ids = (key: 'animalId' | 'adopterId') =>
    Array.from(new Set(items.map((i: any) => String(i[key] || '')).filter(v => Types.ObjectId.isValid(v))));

  const [animals, adopters] = await Promise.all([
    Animal.find({ _id: { $in: ids('animalId') } }).select('name code species').lean(),
    User.find({ _id: { $in: ids('adopterId') } }).select('name email').lean(),
  ]);
  const animalById = new Map(animals.map((a: any) => [String(a._id), a]));
  const adopterById = new Map(adopters.map((u: any) => [String(u._id), u]));

  const enriched = items.map((it: any) => ({
    ...it,
    animal: animalById.get(String(it.animalId)) || null,
    adopter: adopterById.get(String(it.adopterId)) || null,
  }));

  res.json({ items: enriched, page: pg, limit: lim, total });
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

  // Resumen del perfil del solicitante para la protectora/admin (no para el propio adoptante).
  let adopter: any = undefined;
  if ((isShelter || isAdmin) && app.adopterId) {
    const [adopterUser, pets, petsCount] = await Promise.all([
      User.findById(app.adopterId).select('name email createdAt profile').lean() as any,
      Animal.find({ ownerId: app.adopterId }).select('name species images code').sort({ createdAt: -1 }).limit(6).lean(),
      Animal.countDocuments({ ownerId: app.adopterId }),
    ]);
    if (adopterUser) {
      // Los datos personales viven en el subdocumento `profile` (city bajo profile.address).
      const p = adopterUser.profile || {};
      adopter = {
        id: String(adopterUser._id),
        name: adopterUser.name,
        avatarUrl: p.avatarUrl,
        age: p.age,
        city: p.address?.city,
        phone: p.phone,
        email: adopterUser.email,
        bio: p.bio,
        memberSince: adopterUser.createdAt,
        petsCount,
        pets: (pets || []).map((p: any) => ({
          id: String(p._id),
          name: p.name,
          species: p.species,
          code: p.code,
          image: Array.isArray(p.images) ? p.images[0] : undefined,
        })),
      };
    }
  }

  // Cuántas candidaturas cerró esta aprobación. Lo pide el aviso de "deshacer la
  // aprobación", que promete reabrirlas: si va a decir un número, que sea el real.
  let closedSiblings: number | undefined;
  if ((isShelter || isAdmin) && app.status === 'aprobada' && animal) {
    closedSiblings = await Adoption.countDocuments({
      animalId: String(animal._id),
      _id: { $ne: app._id },
      status: 'rechazada',
      history: {
        $elemMatch: { 'payload.reason': 'animal_adopted', 'payload.adoptionId': String(app._id) },
      },
    });
  }

  res.json({ ...app, animal, adopter, closedSiblings });
}
