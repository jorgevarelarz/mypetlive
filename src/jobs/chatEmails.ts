import Conversation from '../models/conversation.model';
import Message from '../models/message.model';
import { User } from '../models/user.model';
import { sendEmail } from '../utils/notification';
import { brandedEmail } from '../utils/emailTemplates';
import { escapeHtml } from '../utils/escapeHtml';
import { displayName, summarize } from '../utils/chat';
import logger from '../utils/logger';

// Correo de «tienes un mensaje sin leer». Sobre todo para las protectoras, que
// contestan desde el ordenador y no tienen la app: sin esto, un adoptante
// escribe y nadie se entera hasta que entra por casualidad.
//
// Sale a los 10 minutos del PRIMER mensaje sin leer (si lo lee antes, no sale)
// y solo uno por conversación hasta que la abra: cinco mensajes seguidos no
// son cinco correos.

export const CHAT_EMAIL_DELAY_MIN = 10;
const FRONTEND_URL = () => process.env.FRONTEND_URL || 'https://mypetlive.es';

export async function sendUnreadChatEmails(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CHAT_EMAIL_DELAY_MIN * 60_000);
  const convs = await Conversation.find({
    pendingEmail: { $elemMatch: { emailed: false, since: { $lte: cutoff } } },
  }).limit(200);

  let sent = 0;
  for (const conv of convs) {
    for (const entry of conv.pendingEmail) {
      if (entry.emailed || entry.since > cutoff) continue;
      // Se marca antes de enviar: un fallo de correo no puede convertirse en un
      // correo cada dos minutos.
      entry.emailed = true;
      conv.markModified('pendingEmail');
      await conv.save();

      const recipient: any = await User.findById(entry.userId).select('email chatEmailOff deletedAt').lean();
      if (!recipient?.email || recipient.chatEmailOff || recipient.deletedAt) continue;

      // El último mensaje de la otra persona que este destinatario no ha leído.
      const last: any = await Message.findOne({
        conversationId: String(conv._id), type: 'user', senderId: { $ne: entry.userId }, readBy: { $ne: entry.userId },
      }).sort({ createdAt: -1 }).lean();
      if (!last) continue;

      const [summary] = await summarize([conv.toObject()], entry.userId);
      const sender: any = await User.findById(last.senderId).select('name role profile.orgName deletedAt').lean();
      const who = displayName(sender);
      const animal = summary?.animal?.name;
      const ctx: any = summary?.context || {};
      const about = !animal
        ? ''
        : ctx.type === 'adoption'
          ? ctx.role === 'shelter' ? `sobre su solicitud para adoptar a ${animal}` : `sobre tu solicitud para adoptar a ${animal}`
          : `sobre la cita de ${animal}`;
      const quote = last.body ? last.body.slice(0, 400) : '📷 Te ha enviado una foto';
      const url = `${FRONTEND_URL()}/mensajes/${conv._id}`;
      const subject = animal ? `${who} te ha escrito sobre ${animal}` : `${who} te ha escrito`;

      const text = `${who}${about ? `, ${about}` : ''}:\n\n«${quote}»\n\nContesta en MyPetLive: ${url}\n\n` +
        `Te avisamos por correo cuando un mensaje lleva ${CHAT_EMAIL_DELAY_MIN} minutos sin leer. Puedes desactivarlo en Ajustes.`;
      const html = brandedEmail({
        preheader: quote.slice(0, 90),
        heading: 'Tienes un mensaje sin leer',
        bodyHtml:
          `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(who)}${about ? `, ${escapeHtml(about)}` : ''}:</p>` +
          `<p style="margin:0;padding:12px 16px;border-left:3px solid #1F6F6F;background:#F6F3EC;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">${escapeHtml(quote).replace(/\n/g, '<br>')}</p>`,
        button: { text: 'Contestar en MyPetLive', url },
        footnote: `Te avisamos por correo cuando un mensaje lleva ${CHAT_EMAIL_DELAY_MIN} minutos sin leer. Puedes desactivarlo en Ajustes.`,
      });
      try {
        await sendEmail(recipient.email, subject, text, html);
        sent += 1;
      } catch (err) {
        logger.error({ err, conversationId: String(conv._id) }, '[chat] fallo al enviar el correo de mensaje sin leer');
      }
    }
  }
  if (sent) logger.info({ sent }, '[chat] correos de mensajes sin leer enviados');
  return sent;
}
