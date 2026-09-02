import { Animal } from '../models/animal.model';
import { CareLog } from '../models/careLog.model';
import { User } from '../models/user.model';
import { sendEmail } from '../utils/notification';
import { brandedEmail } from '../utils/emailTemplates';
import { sendPushToUser } from '../utils/push';
import { supplyForecast, usesPerDayFrom, formatBase, type SupplyUnit } from '../utils/supplies';
import { findWhereToBuy, type ShopOption } from '../utils/shopping';
import logger from '../utils/logger';

// Aviso de "se acaba el pienso".
//
// El umbral mira los DÍAS que quedan y también las raciones: avisar cuando
// quedan dos comidas no da tiempo a comprar nada —de ahí los días—, pero fiarlo
// TODO a los días dejaba sin correo a quien tiene una ración y un ritmo lento.
//
// Idempotente por `lowNotifiedAt` en el propio producto, que se borra al reponer
// (ver `upsertSupply`): repetirlo cada cuarto de hora sería la forma más rápida
// de que alguien desactive los correos.

const ALERT_DAYS = 3;
const ALERT_USES = 3;
const WEEK_MS = 7 * 24 * 3_600_000;
const FRONTEND_URL = () => process.env.FRONTEND_URL || 'https://mypetlive.es';

type Kind = 'food' | 'litter';

/** Ritmo real de uso de un producto, sacado del registro de cuidado. */
async function usesPerDayOf(animalId: any, kind: Kind, name: string): Promise<number | undefined> {
  const since = new Date(Date.now() - WEEK_MS);
  const key = name.trim().toLowerCase();
  const week = await CareLog.find({
    animalId,
    type: kind === 'food' ? 'feed' : 'litter',
    createdAt: { $gte: since },
  })
    .select('foods litterType createdAt')
    .lean();
  const uses = week.filter(entry =>
    kind === 'food'
      ? (entry.foods || []).some(f => f.trim().toLowerCase() === key)
      : (entry.litterType || '').trim().toLowerCase() === key,
  );
  // El mismo cálculo que la ficha, y por el mismo sitio: tenerlo escrito dos
  // veces es lo que dejó que se separaran.
  return usesPerDayFrom(uses.map((e: any) => e.createdAt));
}

/**
 * 🔴 Era un `if/else`: conocido el ritmo, decidía SOLO por días e ignoraba que
 * quedaran una o dos raciones. Con el ritmo inflado que había, la ficha podía
 * pintar "⚠️ se está acabando" y el correo no salir nunca: dos respuestas
 * distintas a la misma pregunta. Ahora es un "o", como `isRunningLow`.
 */
function isLow(forecast: { usesLeft: number | null; daysLeft: number | null }): boolean {
  if (forecast.usesLeft === null) return false;
  if (forecast.usesLeft <= ALERT_USES) return true;
  return forecast.daysLeft !== null && forecast.daysLeft <= ALERT_DAYS;
}

function describeLeft(kind: Kind, forecast: { usesLeft: number | null; daysLeft: number | null }) {
  const noun = kind === 'food' ? 'comidas' : 'cambios';
  const uses = `${forecast.usesLeft} ${forecast.usesLeft === 1 ? noun.slice(0, -1) : noun}`;
  if (forecast.daysLeft === null) return `para ${uses}`;
  return `para ${uses}, unos ${forecast.daysLeft === 1 ? '1 día' : `${forecast.daysLeft} días`}`;
}

/** A quién le importa: el dueño de la mascota, o la protectora si aún está a su cargo. */
function recipientIdOf(animal: any): string | undefined {
  if (animal.ownerId) return String(animal.ownerId);
  if (animal.shelter) return String(animal.shelter);
  return undefined;
}

/**
 * Bloque "dónde comprarlo". Los enlaces pasan por el redirector medido para
 * saber si esto le sirve a alguien: es el dato que justifica el marketplace.
 *
 * Un producto comprable lleva a su ficha (`/click/product/:id`) y se anuncia como
 * tal; el resto sigue llevando a la lista de tiendas. La diferencia importa: el
 * correo llega justo cuando se está acabando el pienso, y un enlace que lo trae
 * a casa no es lo mismo que uno que enumera sitios donde quizá lo haya.
 */
async function whereToBuyBlock(product: string, animalId: string): Promise<{ text: string; html: string }> {
  const options = await findWhereToBuy(product, 3);
  if (!options.length) return { text: '', html: '' };

  const query = `product=${encodeURIComponent(product)}&src=email&animal=${animalId}`;
  const link = (option: ShopOption) =>
    option.source === 'marketplace'
      ? `${FRONTEND_URL()}/api/shop/click/product/${option.productId}?${query}`
      : `${FRONTEND_URL()}/api/shop/click/${option.partnerId}?${query}`;

  const lines = options.map(option => {
    const price = option.priceEur !== undefined ? ` — ${option.priceEur.toFixed(2)} €` : '';
    const city = option.city ? ` (${option.city})` : '';
    const coupon = option.coupon ? ` · cupón: ${option.coupon.discount}` : '';
    const buyable = option.source === 'marketplace' ? ' · se envía a casa' : '';
    return { option, label: `${option.partnerName}${city}${price}${coupon}${buyable}` };
  });

  return {
    text: `\n\nDónde comprarlo:\n${lines.map(l => `- ${l.label}: ${link(l.option)}`).join('\n')}`,
    html:
      `<p style="margin:16px 0 8px"><strong>Dónde comprarlo</strong></p><ul style="margin:0;padding-left:18px">` +
      lines
        .map(l => `<li style="margin-bottom:6px"><a href="${link(l.option)}">${l.label}</a></li>`)
        .join('') +
      `</ul>`,
  };
}

/**
 * Una pasada: avisa de los productos que se acaban y marca el aviso.
 * Devuelve cuántos avisos ha enviado.
 */
export async function sendSupplyAlerts(): Promise<number> {
  // Solo animales con algún producto con ración configurada: sin eso no hay nada
  // que predecir y no hay a quién avisar.
  const animals = await Animal.find({
    $or: [{ 'carePantry.foods.perUse': { $gt: 0 } }, { 'carePantry.litters.perUse': { $gt: 0 } }],
  }).limit(500);

  let sent = 0;

  for (const animal of animals as any[]) {
    const recipientId = recipientIdOf(animal);
    if (!recipientId) continue;

    for (const kind of ['food', 'litter'] as Kind[]) {
      const list = kind === 'food' ? animal.carePantry?.foods : animal.carePantry?.litters;
      for (const supply of list || []) {
        if (!supply?.perUse || supply.remaining === undefined || supply.remaining === null) continue;
        if (supply.lowNotifiedAt) continue;

        const forecast = supplyForecast(supply, await usesPerDayOf(animal._id, kind, supply.name));
        if (!isLow(forecast)) continue;

        try {
          const user = await User.findById(recipientId).select('email name').lean();
          const left = describeLeft(kind, forecast);
          const quantity = formatBase(supply.remaining, (supply.unit as SupplyUnit) || 'g');
          const subject =
            kind === 'food'
              ? `A ${animal.name} le queda poca comida`
              : `A ${animal.name} le queda poca arena`;
          const intro =
            `Queda ${quantity} de ${supply.name}: ${left}. ` +
            `Te avisamos con tiempo para que no te pille en el último momento.`;
          const shop = await whereToBuyBlock(supply.name, String(animal._id));

          if (user?.email) {
            await sendEmail(
              user.email,
              subject,
              `${intro}${shop.text}\n\n${FRONTEND_URL()}/pet`,
              brandedEmail({
                preheader: `Queda ${quantity} de ${supply.name}.`,
                heading: subject,
                bodyHtml: `<p style="margin:0 0 12px">${intro}</p>${shop.html}`,
                button: { text: 'Ver la despensa', url: `${FRONTEND_URL()}/pet` },
                footnote: 'Te avisamos una vez por producto; el aviso vuelve a armarse cuando repongas.',
              }),
            );
          }

          await sendPushToUser(recipientId, {
            title: subject,
            body: `Queda ${quantity} de ${supply.name} (${left}).`,
            url: '/pet',
          });

          supply.lowNotifiedAt = new Date();
          sent += 1;
        } catch (err) {
          logger.error({ err, animalId: String(animal._id), supply: supply.name }, '[despensa] fallo al avisar');
        }
      }
    }

    if (animal.isModified?.('carePantry')) await animal.save();
  }

  return sent;
}
