import { Request, Response } from 'express';
import { Types } from 'mongoose';
import crypto from 'crypto';
import { VetAppointment } from '../models/vetAppointment.model';
import { buildCalendar, IcsEvent } from '../utils/ics';
import { Animal } from '../models/animal.model';
import { User } from '../models/user.model';
import { sendEmail } from '../utils/notification';
import { sendPushToUser } from '../utils/push';
import { formatWhen, postSystemMessage } from '../utils/chat';
import { AnimalEvent } from '../models/animalEvent.model';
import { withRequiredTxn, withTxnIfAvailable } from '../utils/txn';
import { AppError } from '../utils/errors';
import { PatitaTxn } from '../models/patitaTxn.model';
import {
  eurFromPatitas, centsFromPatitas, genRedeemCode,
  lockPatitas, releasePatitas, consumeLockedPatitas, availablePatitas,
} from '../utils/patitas';
import { isStripeConfigured, getStripeClient } from '../utils/stripe';
import logger from '../utils/logger';

function actor(req: Request) {
  const u: any = (req as any).user || {};
  return { id: String(u._id || u.id || ''), role: u.role as string };
}

function fmtDate(d?: Date | string) {
  if (!d) return 'fecha por confirmar';
  return new Date(d).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
}

// Notifica por email a la parte indicada y, si se pasa `push`, también a su
// móvil (abre la agenda al tocarlo). Best-effort: nunca rompe el flujo.
async function notify(
  to: string | undefined,
  subject: string,
  body: string,
  push?: { userId: unknown; title: string; body?: string },
) {
  if (push?.userId) {
    void sendPushToUser(String(push.userId), { title: push.title, body: push.body, url: '/citas' }).catch(err =>
      logger.error({ err }, '[vet-appointments] fallo al enviar push'),
    );
  }
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
  const filter: any = { role: 'vet', deletedAt: null };
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
      serviceCatalog: v.profile?.vet?.serviceCatalog || [],
      schedule: v.profile?.vet?.schedule,
      emergency24h: !!v.profile?.vet?.emergency24h,
    })),
  });
}

// --- Feed iCal de la agenda del vet -----------------------------------------
// El vet conecta su Google/Apple/Outlook suscribiéndolo a una URL secreta .ics
// (token-capability). El proveedor la refresca solo; no hay OAuth ni sesión.

function calendarFeedUrl(token: string) {
  const base = process.env.PUBLIC_API_URL || process.env.FRONTEND_URL || 'https://mypetlive.es';
  return `${base.replace(/\/$/, '')}/api/vets/calendar/${token}.ics`;
}

// GET /api/vets/me/calendar-feed — URL del feed del vet autenticado (la crea si no existe).
export async function getCalendarFeed(req: Request, res: Response) {
  const { id } = actor(req);
  const user: any = await User.findById(id).select('+calendarFeedToken role');
  if (!user || user.role !== 'vet') return res.status(403).json({ error: 'vet_only' });
  if (!user.calendarFeedToken) {
    user.calendarFeedToken = crypto.randomBytes(24).toString('hex');
    await user.save();
  }
  res.json({ url: calendarFeedUrl(user.calendarFeedToken) });
}

// POST /api/vets/me/calendar-feed/rotate — genera un token nuevo; la URL anterior deja de valer.
export async function rotateCalendarFeed(req: Request, res: Response) {
  const { id } = actor(req);
  const token = crypto.randomBytes(24).toString('hex');
  const user = await User.findOneAndUpdate({ _id: id, role: 'vet' }, { calendarFeedToken: token }, { new: true });
  if (!user) return res.status(403).json({ error: 'vet_only' });
  res.json({ url: calendarFeedUrl(token) });
}

// GET /api/vets/calendar/:token.ics — feed público por token (lo consultan los
// proveedores de calendario sin sesión; el token de 48 hex hace de credencial).
export async function calendarFeedIcs(req: Request, res: Response) {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{32,64}$/.test(token)) return res.status(404).json({ error: 'not_found' });
  const vet: any = await User.findOne({ calendarFeedToken: token, role: 'vet' })
    .select('name profile.orgName')
    .lean();
  if (!vet) return res.status(404).json({ error: 'not_found' });

  // Ventana: 6 meses atrás → futuro. Las canceladas se emiten con STATUS:CANCELLED
  // para que el proveedor las quite del calendario del vet.
  const from = new Date(Date.now() - 182 * 24 * 3600 * 1000);
  const appts: any[] = await VetAppointment.find({
    vetId: vet._id,
    $or: [{ scheduledAt: { $gte: from } }, { scheduledAt: null, requestedAt: { $gte: from } }],
  })
    .populate('userId', 'name')
    .lean();

  const events: IcsEvent[] = appts.map(a => {
    const client = a.userId?.name || 'Cliente';
    const bits = [
      a.reason ? `Motivo: ${a.reason}` : '',
      a.animalCode ? `Mascota: ${a.animalCode}` : '',
      a.service?.priceEur != null ? `Precio: ${a.service.priceEur} €${a.service.pricingType === 'fijo' ? '' : ' (orientativo)'}` : '',
      a.status === 'requested' ? 'Pendiente de confirmar en MyPetLive.' : '',
    ].filter(Boolean);
    return {
      uid: `${a._id}@mypetlive.es`,
      start: new Date(a.scheduledAt || a.requestedAt),
      summary: `${a.service?.name || 'Cita'} — ${client}${a.animalCode ? ` (${a.animalCode})` : ''}`,
      description: bits.join('\n'),
      status: a.status === 'cancelled' ? 'CANCELLED' : a.status === 'requested' ? 'TENTATIVE' : 'CONFIRMED',
      updatedAt: a.updatedAt ? new Date(a.updatedAt) : undefined,
    };
  });

  const ics = buildCalendar(`MyPetLive — ${vet.profile?.orgName || vet.name}`, events);
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'inline; filename="mypetlive.ics"');
  res.set('Cache-Control', 'private, max-age=300');
  res.send(ics);
}

// POST /api/vet-appointments — el dueño (adoptante o protectora) solicita una cita.
export async function createAppointment(req: Request, res: Response) {
  const { id: userId, role } = actor(req);
  const { vetId, animalCode, reason, requestedAt, serviceName } = req.body || {};

  if (!vetId || !Types.ObjectId.isValid(String(vetId))) return res.status(400).json({ error: 'invalid_vet' });
  const vet: any = await User.findOne({ _id: vetId, role: 'vet', deletedAt: null }).select('_id profile.vet.serviceCatalog').lean();
  if (!vet) return res.status(404).json({ error: 'vet_not_found' });

  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (!cleanReason) return res.status(400).json({ error: 'reason_required' });

  // Servicio opcional: debe existir en el catálogo actual del vet. Se guarda como
  // snapshot (nombre/precio/tipo del momento de la solicitud), nunca el precio del cliente.
  let service: { name: string; priceEur?: number; pricingType: string } | undefined;
  if (serviceName != null && String(serviceName).trim()) {
    const wanted = String(serviceName).trim().toLowerCase();
    const match = (vet.profile?.vet?.serviceCatalog || []).find(
      (s: any) => String(s?.name || '').trim().toLowerCase() === wanted,
    );
    if (!match) return res.status(400).json({ error: 'service_not_found' });
    service = { name: match.name, priceEur: match.priceEur, pricingType: match.pricingType || 'variable' };
  }

  const when = requestedAt ? new Date(requestedAt) : null;
  if (!when || Number.isNaN(when.getTime())) return res.status(400).json({ error: 'invalid_date' });
  if (when.getTime() < Date.now() - 60_000) return res.status(400).json({ error: 'date_in_past' });

  // Animal opcional: si se da el código, debe ser una mascota del solicitante
  // (dueño del animal) o, si agenda una protectora, un animal de su protectora.
  let animalId: string | undefined;
  let code: string | undefined;
  if (animalCode) {
    const normalized = String(animalCode).trim().toUpperCase();
    const animal: any = await Animal.findOne({ code: normalized }).select('_id code ownerId shelter').lean();
    if (!animal) return res.status(404).json({ error: 'animal_not_found' });
    const uid = String(userId);
    const isOwner = String(animal.ownerId || '') === uid || String(animal.shelter || '') === uid;
    if (!isOwner && role !== 'admin') return res.status(403).json({ error: 'animal_not_owned' });
    animalId = String(animal._id);
    code = animal.code;
  }

  // Pago con Patitas: solo cuando agenda una protectora (landlord). Decidir
  // pagar con Patitas las BLOQUEA en el acto — antes solo se comprobaba el saldo
  // aquí y se debitaba al completar, así que gastarlo entre medias dejaba al vet
  // sin cobrar. El bloqueo es atómico, no un "leer y luego escribir".
  let patitasCost = 0;
  if ((role === 'landlord' || role === 'admin') && req.body?.patitasCost != null) {
    const n = Number(req.body.patitasCost);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'invalid_patitas_cost' });
    patitasCost = Math.round(n);
  }
  const payload = {
    vetId, userId, animalId, animalCode: code, reason: cleanReason, service, requestedAt: when, status: 'requested',
    patitasCost, patitasReserved: patitasCost > 0, payoutStatus: patitasCost > 0 ? 'pending_payout' : 'none',
  };
  let appt;
  if (patitasCost > 0) {
    appt = await withRequiredTxn(async session => {
      if (!(await lockPatitas(userId, patitasCost, session))) return null;
      const [created] = await VetAppointment.create([payload], { session });
      return created;
    });
    if (!appt) {
      const shelter = await User.findById(userId).select('patitas patitasLocked').lean();
      return res.status(400).json({ error: 'insufficient_patitas', available: availablePatitas(shelter) });
    }
  } else {
    appt = await VetAppointment.create(payload);
  }

  // Abre la conversación con el veterinario: la cita sale en Mensajes de los dos.
  await postSystemMessage({
    kind: 'vet_appointment', refId: String(appt._id), code: 'vet.requested', actorId: userId,
    body: `Cita solicitada para el ${formatWhen(when)}${service ? `: ${service.name}` : ''}. Motivo: ${cleanReason.slice(0, 300)}`,
    payload: { at: when, service: service?.name, reason: cleanReason.slice(0, 300) },
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
      `Motivo: ${cleanReason}${service ? `\nServicio: ${service.name}${service.priceEur != null ? ` (${service.priceEur} €${service.pricingType === 'fijo' ? '' : ', orientativo'})` : ' (presupuesto)'}` : ''}${code ? `\nMascota: ${code}` : ''}\n\nRevísala en tu panel de MyPetLive.`,
    { userId: vetId, title: 'Nueva solicitud de cita', body: `${(owner as any)?.name || 'Un cliente'} pide cita para el ${fmtDate(when)}.` },
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
  if (!Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const initial = await VetAppointment.findById(req.params.id).lean();
  if (!initial) return res.status(404).json({ error: 'not_found' });
  const { status, scheduledAt, vetNotes, cancelReason } = req.body || {};
  if (typeof status !== 'string') return res.status(400).json({ error: 'status_required' });

  // Leer y validar de nuevo dentro de la transacción: dos cancelaciones o dos
  // confirmaciones simultáneas no pueden gastar/liberar la misma reserva.
  const transact = initial.patitasCost > 0 ? withRequiredTxn : withTxnIfAvailable;
  let result;
  try {
    result = await transact(async session => {
      const appt: any = await VetAppointment.findById(req.params.id).session(session ?? null);
      if (!appt) throw new AppError('not_found', { status: 404 });
      const isVet = role === 'vet' && String(appt.vetId) === actorId;
      const isOwner = String(appt.userId) === actorId;
      const isAdmin = role === 'admin';
      if (!isVet && !isOwner && !isAdmin) throw new AppError('forbidden', { status: 403 });
      if (!isVet && !isAdmin && status !== 'cancelled') throw new AppError('owner_can_only_cancel', { status: 403 });
      const retrySettlement = status === 'completed' && appt.status === status && appt.patitasCost > 0 && !appt.patitasPaid;
      if (!(VET_TRANSITIONS[appt.status] || []).includes(status) && !retrySettlement) {
        throw new AppError('invalid_transition', { status: 409 });
      }
      if (status === 'confirmed' || status === 'rescheduled') {
        if (scheduledAt) {
          const when = new Date(scheduledAt);
          if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) throw new AppError('invalid_date', { status: 400 });
          appt.scheduledAt = when;
        } else if (status === 'confirmed' && !appt.scheduledAt) {
          appt.scheduledAt = appt.requestedAt;
        } else if (status === 'rescheduled') throw new AppError('scheduled_at_required', { status: 400 });
      }
      if (typeof vetNotes === 'string' && (isVet || isAdmin)) appt.vetNotes = vetNotes.trim().slice(0, 1000);
      if (status === 'cancelled' && typeof cancelReason === 'string') appt.cancelReason = cancelReason.trim().slice(0, 500);
      appt.status = status;
      let patitasSettlementFailed = false;
      if (status === 'cancelled' && appt.patitasReserved && !appt.patitasPaid) {
        if (!(await releasePatitas(String(appt.userId), appt.patitasCost, session))) {
          throw new AppError('reservation_inconsistent', { status: 409 });
        }
        appt.patitasReserved = false;
        appt.payoutStatus = 'none';
      }
      if (status === 'completed' && appt.patitasCost > 0 && !appt.patitasPaid) {
        const debited = appt.patitasReserved
          ? await consumeLockedPatitas(String(appt.userId), appt.patitasCost, session)
          : await User.findOneAndUpdate(
              { _id: appt.userId, $expr: { $gte: [{ $subtract: [{ $ifNull: ['$patitas', 0] }, { $ifNull: ['$patitasLocked', 0] }] }, appt.patitasCost] } },
              { $inc: { patitas: -appt.patitasCost } }, { new: true, session },
            );
        if (debited) {
          const code = genRedeemCode();
          await PatitaTxn.create([{
            type: 'redeem', shelterId: appt.userId, partnerId: appt.vetId,
            amount: appt.patitasCost, valueEur: eurFromPatitas(appt.patitasCost), code,
            status: 'pending_payout', concept: 'Cita veterinaria',
          }], { session });
          appt.patitasReserved = false;
          appt.patitasPaid = true;
          appt.patitasCode = code;
          appt.payoutStatus = 'pending_payout';
        } else patitasSettlementFailed = true;
      }
      let clinicalRecordAdded = false;
      if (!retrySettlement && status === 'completed' && req.body?.addToHistory && appt.animalCode) {
        const animal: any = await Animal.findOne({ code: appt.animalCode }).session(session ?? null);
        if (animal) {
          const note = appt.vetNotes || appt.reason || 'Visita veterinaria';
          animal.vetHistory.push({ date: appt.scheduledAt || appt.requestedAt, note });
          await animal.save({ session });
          await AnimalEvent.create([{ animalId: String(animal._id), code: animal.code, type: 'vet', actorId, data: { note, fromAppointment: String(appt._id) } }], { session });
          clinicalRecordAdded = true;
        }
      }
      await appt.save({ session });
      return { appt, isVet, isOwner, clinicalRecordAdded, patitasSettlementFailed };
    });
  } catch (err) {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
  const { appt, isVet, isOwner, clinicalRecordAdded, patitasSettlementFailed } = result;
  const isAdmin = role === 'admin';

  // Stripe queda fuera del callback, que Mongo puede repetir. El asiento ya
  // existe aunque el proveedor falle; la clave impide duplicar el mismo pago.
  if (status === 'completed' && appt.patitasPaid && appt.payoutStatus === 'pending_payout') {
    const vetDoc = await User.findById(appt.vetId).select('stripeAccountId').lean();
    if (isStripeConfigured() && vetDoc?.stripeAccountId) {
      try {
        const transfer = await getStripeClient().transfers.create({
          amount: centsFromPatitas(appt.patitasCost), currency: 'eur', destination: vetDoc.stripeAccountId,
          metadata: { code: appt.patitasCode, appointmentId: String(appt._id), patitas: String(appt.patitasCost) },
        }, { idempotencyKey: `vet-appointment-${appt._id}` });
        await withRequiredTxn(async session => {
          await PatitaTxn.updateOne({ code: appt.patitasCode }, { status: 'paid', payoutRef: transfer.id }, { session });
          await VetAppointment.updateOne({ _id: appt._id }, { payoutStatus: 'paid' }, { session });
        });
        appt.payoutStatus = 'paid';
      } catch (err) {
        logger.error({ err, appointmentId: String(appt._id) }, '[vet-appointments] liquidación pendiente');
      }
    }
  }

  // Tarjeta en el chat de la cita (no en el reintento de liquidar: no cambia nada).
  const CHAT_TEXT: Record<string, string> = {
    confirmed: `Cita confirmada para el ${formatWhen(appt.scheduledAt || appt.requestedAt)}.`,
    rescheduled: `Nueva fecha propuesta para la cita: ${formatWhen(appt.scheduledAt || appt.requestedAt)}.`,
    completed: 'Cita completada.',
    cancelled: `Cita cancelada.${appt.cancelReason ? ` Motivo: ${appt.cancelReason}` : ''}`,
  };
  if (CHAT_TEXT[status] && !(status === 'completed' && initial.status === 'completed')) {
    await postSystemMessage({
      kind: 'vet_appointment', refId: String(appt._id), code: `vet.${status}`, actorId,
      body: CHAT_TEXT[status],
      payload: { status, at: appt.scheduledAt || appt.requestedAt, ...(appt.cancelReason && status === 'cancelled' ? { reason: appt.cancelReason } : {}) },
    });
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
    const when = fmtDate(appt.scheduledAt || appt.requestedAt);
    await notify(to, 'Cita cancelada — MyPetLive', `La cita del ${when} ha sido cancelada.${appt.cancelReason ? `\nMotivo: ${appt.cancelReason}` : ''}`, {
      userId: cancelledByOwner ? appt.vetId : appt.userId,
      title: 'Cita cancelada',
      body: `La cita del ${when}${appt.cancelReason ? `. Motivo: ${appt.cancelReason}` : ''}`,
    });
  } else if (STATUS_TEXT[status]) {
    // Confirmaciones/reprogramaciones/completar las hace el vet → avisar al dueño.
    const PUSH_TITLE: Record<string, string> = {
      confirmed: 'Cita confirmada ✅',
      rescheduled: 'Nueva fecha para tu cita',
      completed: 'Cita completada',
    };
    await notify((owner as any)?.email, 'Actualización de tu cita veterinaria — MyPetLive', STATUS_TEXT[status], {
      userId: appt.userId,
      title: PUSH_TITLE[status],
      body: STATUS_TEXT[status],
    });
  }

  res.json({ ...appt.toObject(), clinicalRecordAdded, patitasSettlementFailed });
}
