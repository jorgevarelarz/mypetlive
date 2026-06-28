import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { VetAppointment } from '../models/vetAppointment.model';
import { Animal } from '../models/animal.model';
import { User } from '../models/user.model';
import { sendEmail } from '../utils/notification';
import { logAnimalEvent } from '../utils/animalEvents';
import logger from '../utils/logger';

function actor(req: Request) {
  const u: any = (req as any).user || {};
  return { id: String(u._id || u.id || ''), role: u.role as string };
}

function fmtDate(d?: Date | string) {
  if (!d) return 'fecha por confirmar';
  return new Date(d).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
}

// Notifica por email a la parte indicada. Best-effort: nunca rompe el flujo.
async function notify(to: string | undefined, subject: string, body: string) {
  if (!to) return;
  try {
    await sendEmail(to, subject, body);
  } catch (err) {
    logger.error({ err, to }, '[vet-appointments] fallo al enviar email');
  }
}

// GET /api/vets — directorio público de veterinarios (para que el dueño elija).
export async function listVets(req: Request, res: Response) {
  const { city, q } = req.query as Record<string, string>;
  const filter: any = { role: 'vet' };
  if (city) filter['profile.address.city'] = new RegExp(String(city).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { 'profile.orgName': rx }];
  }
  const vets = await User.find(filter).select('name profile.orgName profile.avatarUrl profile.address.city profile.vet').sort({ name: 1 }).lean();
  res.json({
    items: vets.map((v: any) => ({
      _id: String(v._id),
      name: v.profile?.orgName || v.name,
      avatarUrl: v.profile?.avatarUrl,
      city: v.profile?.address?.city,
      specialties: v.profile?.vet?.specialties || [],
      services: v.profile?.vet?.services || [],
      schedule: v.profile?.vet?.schedule,
      emergency24h: !!v.profile?.vet?.emergency24h,
    })),
  });
}

// POST /api/vet-appointments — el dueño solicita una cita.
export async function createAppointment(req: Request, res: Response) {
  const { id: userId } = actor(req);
  const { vetId, animalCode, reason, requestedAt } = req.body || {};

  if (!vetId || !Types.ObjectId.isValid(String(vetId))) return res.status(400).json({ error: 'invalid_vet' });
  const vet = await User.findOne({ _id: vetId, role: 'vet' }).select('_id').lean();
  if (!vet) return res.status(404).json({ error: 'vet_not_found' });

  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (!cleanReason) return res.status(400).json({ error: 'reason_required' });

  const when = requestedAt ? new Date(requestedAt) : null;
  if (!when || Number.isNaN(when.getTime())) return res.status(400).json({ error: 'invalid_date' });
  if (when.getTime() < Date.now() - 60_000) return res.status(400).json({ error: 'date_in_past' });

  // Animal opcional: si se da el código, lo resolvemos (no exigimos propiedad — el dueño sabe su código).
  let animalId: string | undefined;
  let code: string | undefined;
  if (animalCode) {
    const normalized = String(animalCode).trim().toUpperCase();
    const animal = await Animal.findOne({ code: normalized }).select('_id code').lean();
    if (!animal) return res.status(404).json({ error: 'animal_not_found' });
    animalId = String(animal._id);
    code = (animal as any).code;
  }

  const appt = await VetAppointment.create({
    vetId, userId, animalId, animalCode: code, reason: cleanReason, requestedAt: when, status: 'requested',
  });

  // Avisar al veterinario de la nueva solicitud.
  const [vetUser, owner] = await Promise.all([
    User.findById(vetId).select('email name').lean(),
    User.findById(userId).select('name').lean(),
  ]);
  await notify(
    (vetUser as any)?.email,
    'Nueva solicitud de cita en MyPetLive',
    `${(owner as any)?.name || 'Un cliente'} ha solicitado una cita para el ${fmtDate(when)}.\n` +
      `Motivo: ${cleanReason}${code ? `\nMascota: ${code}` : ''}\n\nRevísala en tu panel de MyPetLive.`,
  );

  res.status(201).json(appt);
}

// GET /api/vet-appointments/mine — citas del usuario o del vet autenticado.
export async function listMyAppointments(req: Request, res: Response) {
  const { id, role } = actor(req);
  const filter: any = role === 'vet' ? { vetId: id } : { userId: id };
  const status = String((req.query as any).status || '');
  if (status) filter.status = status;

  const items = await VetAppointment.find(filter)
    .sort({ requestedAt: -1 })
    .populate('userId', 'name profile.avatarUrl')
    .populate('vetId', 'name profile.orgName profile.address.city')
    .populate('animalId', 'name code')
    .lean();
  res.json({ items });
}

// Transiciones permitidas por rol.
const VET_TRANSITIONS: Record<string, string[]> = {
  requested: ['confirmed', 'rescheduled', 'cancelled'],
  confirmed: ['rescheduled', 'completed', 'cancelled'],
  rescheduled: ['confirmed', 'completed', 'cancelled'],
};

// PATCH /api/vet-appointments/:id/status
export async function updateAppointmentStatus(req: Request, res: Response) {
  const { id: actorId, role } = actor(req);
  const appt: any = await VetAppointment.findById(req.params.id);
  if (!appt) return res.status(404).json({ error: 'not_found' });

  const isVet = role === 'vet' && String(appt.vetId) === actorId;
  const isOwner = String(appt.userId) === actorId;
  const isAdmin = role === 'admin';
  if (!isVet && !isOwner && !isAdmin) return res.status(403).json({ error: 'forbidden' });

  const { status, scheduledAt, vetNotes, cancelReason } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status_required' });

  // El dueño solo puede cancelar; el vet/admin manejan el resto de transiciones.
  if (isOwner && !isVet && !isAdmin && status !== 'cancelled') {
    return res.status(403).json({ error: 'owner_can_only_cancel' });
  }
  if (['completed', 'confirmed', 'rescheduled'].includes(status) && !(isVet || isAdmin)) {
    return res.status(403).json({ error: 'vet_only' });
  }

  const allowed = VET_TRANSITIONS[appt.status] || [];
  if (!allowed.includes(status)) {
    return res.status(409).json({ error: 'invalid_transition', from: appt.status, to: status });
  }

  if (status === 'confirmed' || status === 'rescheduled') {
    if (scheduledAt) {
      const when = new Date(scheduledAt);
      if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'invalid_date' });
      appt.scheduledAt = when;
    } else if (status === 'confirmed' && !appt.scheduledAt) {
      // Confirmar sin nueva fecha = se acepta la propuesta del dueño.
      appt.scheduledAt = appt.requestedAt;
    } else if (status === 'rescheduled') {
      return res.status(400).json({ error: 'scheduled_at_required' });
    }
  }
  if (typeof vetNotes === 'string' && (isVet || isAdmin)) appt.vetNotes = vetNotes.trim().slice(0, 1000);
  if (status === 'cancelled' && typeof cancelReason === 'string') appt.cancelReason = cancelReason.trim().slice(0, 500);

  appt.status = status;
  await appt.save();

  // Al completar, el vet puede volcar la cita al historial clínico del animal.
  let clinicalRecordAdded = false;
  if (status === 'completed' && (isVet || isAdmin) && req.body?.addToHistory && appt.animalCode) {
    const animal: any = await Animal.findOne({ code: appt.animalCode });
    if (animal) {
      const note = (appt.vetNotes && appt.vetNotes.trim()) || appt.reason || 'Visita veterinaria';
      animal.vetHistory.push({ date: appt.scheduledAt || appt.requestedAt || new Date(), note });
      await animal.save();
      await logAnimalEvent({ animalId: String(animal._id), code: animal.code, type: 'vet', actorId, data: { note, fromAppointment: String(appt._id) } });
      clinicalRecordAdded = true;
    }
  }

  // Notificar a la contraparte del cambio de estado.
  const [vetUser, owner] = await Promise.all([
    User.findById(appt.vetId).select('email name profile.orgName').lean(),
    User.findById(appt.userId).select('email name').lean(),
  ]);
  const vetName = (vetUser as any)?.profile?.orgName || (vetUser as any)?.name || 'el veterinario';
  const STATUS_TEXT: Record<string, string> = {
    confirmed: `Tu cita con ${vetName} ha sido confirmada para el ${fmtDate(appt.scheduledAt)}.`,
    rescheduled: `${vetName} ha propuesto una nueva fecha para tu cita: ${fmtDate(appt.scheduledAt)}.`,
    completed: `Tu cita con ${vetName} se ha marcado como completada.${clinicalRecordAdded ? ' Se ha añadido un registro al pasaporte de tu mascota.' : ''}`,
  };
  if (status === 'cancelled') {
    // Avisar a la otra parte de quien canceló.
    const cancelledByOwner = isOwner && !isVet && !isAdmin;
    const to = cancelledByOwner ? (vetUser as any)?.email : (owner as any)?.email;
    await notify(to, 'Cita cancelada — MyPetLive', `La cita del ${fmtDate(appt.scheduledAt || appt.requestedAt)} ha sido cancelada.${appt.cancelReason ? `\nMotivo: ${appt.cancelReason}` : ''}`);
  } else if (STATUS_TEXT[status]) {
    // Confirmaciones/reprogramaciones/completar las hace el vet → avisar al dueño.
    await notify((owner as any)?.email, 'Actualización de tu cita veterinaria — MyPetLive', STATUS_TEXT[status]);
  }

  res.json({ ...appt.toObject(), clinicalRecordAdded });
}
