import webpush from 'web-push';
import { PushSubscription } from '../models/pushSubscription.model';
import logger from './logger';

const configured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (configured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:info@mypetlive.es',
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
}

export const pushConfigured = configured;

export type PushPayload = { title: string; body?: string; url?: string };

/**
 * Envía una notificación push a todos los dispositivos suscritos del usuario.
 * Nunca lanza: los fallos se registran y las suscripciones caducadas (404/410)
 * se eliminan para no reintentarlas.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!configured) {
    logger.info({ userId, title: payload.title }, '[Mock push]');
    return;
  }
  const subs = await PushSubscription.find({ userId });
  await Promise.all(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys!.p256dh, auth: sub.keys!.auth } },
          JSON.stringify(payload),
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          logger.error({ err, userId, endpoint: sub.endpoint }, 'Error enviando push');
        }
      }
    }),
  );
}
