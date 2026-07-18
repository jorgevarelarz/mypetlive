import { Types } from 'mongoose';
import { WelcomePlan, WELCOME_TASKS } from '../models/welcomePlan.model';
import { matchOffersForAnimal } from '../controllers/offers.controller';
import { brandedEmail } from './emailTemplates';
import { sendEmail } from './notification';
import logger from './logger';

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'https://mypetlive.es';

/**
 * Activa el plan de bienvenida al cerrarse una adopción: crea la checklist del
 * adoptante (idempotente) y le envía la guía de primeros pasos con sus ofertas
 * de bienvenida segmentadas. Nunca lanza: el cierre de la adopción no debe
 * fallar por un problema de email.
 */
export async function activateWelcomePlan(opts: {
  animal: any;
  adopterId: string;
  adoptionId?: string;
  adopterEmail?: string | null;
}) {
  const { animal, adopterId, adoptionId, adopterEmail } = opts;
  try {
    await WelcomePlan.updateOne(
      { animalId: animal._id, ownerId: new Types.ObjectId(adopterId) },
      {
        $setOnInsert: {
          animalId: animal._id,
          ownerId: new Types.ObjectId(adopterId),
          ...(adoptionId ? { adoptionId: new Types.ObjectId(adoptionId) } : {}),
          activatedAt: new Date(),
          tasks: [],
        },
      },
      { upsert: true },
    );
  } catch (err) {
    logger.error({ err, animalId: String(animal._id) }, '[welcome] No se pudo crear el plan de bienvenida');
  }

  if (!adopterEmail) return;
  try {
    const offers = (await matchOffersForAnimal(animal)).slice(0, 3);
    const base = FRONTEND_URL();

    const stepsText = WELCOME_TASKS.map((t, i) => `${i + 1}. ${t.title}: ${t.description}`).join('\n');
    const offersText = offers.length
      ? `\n\nOfertas de bienvenida para ${animal.name}:\n` +
        offers
          .map(o => `- ${o.title}${o.partner?.name ? ` (${o.partner.name})` : ''}${o.discount ? `: ${o.discount}` : ''}`)
          .join('\n')
      : '';
    const text =
      `¡Enhorabuena! ${animal.name} ya es parte de tu familia.\n\n` +
      `Estos son los primeros pasos que te recomendamos:\n${stepsText}${offersText}\n\n` +
      `Sigue tu plan de bienvenida en ${base}/pets`;

    const stepsHtml = WELCOME_TASKS.map(
      t =>
        `<li style="margin:0 0 12px;"><strong>${t.title}.</strong> ${t.description}</li>`,
    ).join('');
    const offersHtml = offers.length
      ? `<p style="margin:24px 0 8px;font-family:Arial,Helvetica,sans-serif;"><strong>Ofertas de bienvenida para ${animal.name}:</strong></p><ul style="margin:0;padding-left:20px;font-family:Arial,Helvetica,sans-serif;">` +
        offers
          .map(
            o =>
              `<li style="margin:0 0 8px;">${o.title}${o.partner?.name ? ` — ${o.partner.name}` : ''}${o.discount ? ` (${o.discount})` : ''}</li>`,
          )
          .join('') +
        `</ul>`
      : '';
    const html = brandedEmail({
      preheader: `Primeros pasos con ${animal.name}`,
      heading: `¡Bienvenido a casa, ${animal.name}!`,
      bodyHtml:
        `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">¡Enhorabuena! La adopción se ha completado y ${animal.name} ya es parte de tu familia. Para que la llegada sea fácil, te dejamos una guía de primeros pasos:</p>` +
        `<ol style="margin:0;padding-left:20px;font-family:Arial,Helvetica,sans-serif;">${stepsHtml}</ol>` +
        offersHtml,
      button: { text: 'Ver mi plan de bienvenida', url: `${base}/pets` },
      footnote: 'Puedes marcar cada paso como completado desde la ficha de tu mascota en MyPetLive.',
    });

    await sendEmail(adopterEmail, `¡Bienvenido a casa, ${animal.name}! Tu plan de adopción`, text, html);
  } catch (err) {
    logger.error({ err, animalId: String(animal._id) }, '[welcome] No se pudo enviar el email de bienvenida');
  }
}
