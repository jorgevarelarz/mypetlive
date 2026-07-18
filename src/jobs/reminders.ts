import { VetAppointment } from '../models/vetAppointment.model';
import { WelcomePlan, WELCOME_TASKS } from '../models/welcomePlan.model';
import { User } from '../models/user.model';
import { Animal } from '../models/animal.model';
import { sendEmail } from '../utils/notification';
import { brandedEmail } from '../utils/emailTemplates';
import logger from '../utils/logger';

const H24_MS = 24 * 60 * 60 * 1000;
const WELCOME_NUDGE_AFTER_DAYS = 3;
const FRONTEND_URL = () => process.env.FRONTEND_URL || 'https://mypetlive.es';

function fmtDate(d?: Date | string | null) {
  if (!d) return 'fecha por confirmar';
  return new Date(d).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
}

// Best-effort: un fallo con un destinatario no detiene el resto de la pasada.
async function notify(to: string | undefined | null, subject: string, body: string, html?: string) {
  if (!to) return;
  try {
    await sendEmail(to, subject, body, html);
  } catch (err) {
    logger.error({ err, to }, '[reminders] fallo al enviar email');
  }
}

/**
 * Recordatorio 24h antes de la cita veterinaria (confirmadas o reprogramadas),
 * a dueño y vet. Idempotente: marca `reminder24SentAt` en la cita.
 */
export async function sendAppointmentReminders(now = new Date()): Promise<number> {
  const until = new Date(now.getTime() + H24_MS);
  const window = { $gt: now, $lte: until };
  const appts = await VetAppointment.find({
    status: { $in: ['confirmed', 'rescheduled'] },
    reminder24SentAt: { $exists: false },
    // La fecha efectiva es scheduledAt si el vet fijó una; si no, la solicitada.
    $or: [{ scheduledAt: window }, { scheduledAt: null, requestedAt: window }],
  });

  let sent = 0;
  for (const appt of appts) {
    const when = fmtDate((appt as any).scheduledAt || appt.requestedAt);
    const [owner, vet] = await Promise.all([
      User.findById(appt.userId).select('name email').lean(),
      User.findById(appt.vetId).select('name email profile.orgName').lean(),
    ]);
    const animalName = appt.animalId
      ? (await Animal.findById(appt.animalId).select('name').lean())?.name
      : undefined;
    const petLabel = animalName || appt.animalCode || 'tu mascota';
    const vetName = (vet as any)?.profile?.orgName || vet?.name || 'tu veterinario';
    const serviceLine = (appt as any).service?.name ? ` (${(appt as any).service.name})` : '';

    await notify(
      owner?.email,
      `Recordatorio: cita veterinaria el ${when}`,
      `Te recordamos la cita de ${petLabel} con ${vetName}${serviceLine}: ${when}.\n` +
        `Si no puedes asistir, cancélala o reprográmala desde MyPetLive: ${FRONTEND_URL()}/vets/appointments`,
    );
    await notify(
      vet?.email,
      `Recordatorio: cita el ${when}`,
      `Tienes una cita con ${owner?.name || 'un cliente'} para ${petLabel}${serviceLine}: ${when}.\n` +
        `Consulta tu agenda en ${FRONTEND_URL()}/vet/appointments`,
    );

    (appt as any).reminder24SentAt = new Date();
    await appt.save();
    sent += 1;
  }
  if (sent) logger.info({ sent }, '[reminders] recordatorios de cita enviados');
  return sent;
}

/**
 * Empujón del plan de bienvenida: si a los N días de la adopción quedan pasos
 * sin marcar, recuerda al adoptante los pendientes. Se envía una sola vez por
 * plan (`reminderSentAt`); los planes ya completos se marcan sin email.
 */
export async function sendWelcomeReminders(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - WELCOME_NUDGE_AFTER_DAYS * H24_MS);
  const plans = await WelcomePlan.find({
    reminderSentAt: { $exists: false },
    activatedAt: { $lte: cutoff },
  });

  let sent = 0;
  for (const plan of plans) {
    const doneKeys = new Set(plan.tasks.filter(t => t.doneAt).map(t => t.key));
    const pending = WELCOME_TASKS.filter(t => !doneKeys.has(t.key));
    (plan as any).reminderSentAt = new Date();
    await plan.save();
    if (!pending.length) continue;

    const [owner, animal] = await Promise.all([
      User.findById(plan.ownerId).select('email').lean(),
      Animal.findById(plan.animalId).select('name').lean(),
    ]);
    if (!owner?.email) continue;
    const petName = animal?.name || 'tu mascota';
    const base = FRONTEND_URL();

    const text =
      `¿Qué tal los primeros días con ${petName}? Aún tenéis estos pasos del plan de bienvenida por completar:\n` +
      pending.map(t => `- ${t.title}`).join('\n') +
      `\n\nMárcalos desde su ficha: ${base}/pets`;
    const html = brandedEmail({
      preheader: `Pasos pendientes del plan de bienvenida de ${petName}`,
      heading: `¿Qué tal los primeros días con ${petName}?`,
      bodyHtml:
        `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">Aún tenéis estos pasos del plan de bienvenida por completar:</p>` +
        `<ul style="margin:0;padding-left:20px;font-family:Arial,Helvetica,sans-serif;">` +
        pending.map(t => `<li style="margin:0 0 10px;"><strong>${t.title}.</strong> ${t.description}</li>`).join('') +
        `</ul>`,
      button: { text: 'Ver mi plan de bienvenida', url: `${base}/pets` },
      footnote: 'Este es el único recordatorio que te enviaremos sobre el plan de bienvenida.',
    });
    await notify(owner.email, `Los primeros pasos con ${petName} 🐾`, text, html);
    sent += 1;
  }
  if (sent) logger.info({ sent }, '[reminders] recordatorios de bienvenida enviados');
  return sent;
}

/** Programa las pasadas periódicas de recordatorios (arranque del servidor). */
export function startReminderJobs(intervalMs = 15 * 60 * 1000) {
  const run = () => {
    sendAppointmentReminders().catch(err => logger.error({ err }, '[reminders] pasada de citas falló'));
    sendWelcomeReminders().catch(err => logger.error({ err }, '[reminders] pasada de bienvenida falló'));
  };
  // Primera pasada poco después de arrancar (deja respirar la conexión a Mongo).
  setTimeout(run, 30_000);
  return setInterval(run, intervalMs);
}
