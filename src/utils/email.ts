import logger from './logger';
import { sendEmail as deliverEmail } from './notification';
import { User } from '../models/user.model';

async function resolveRecipient(identifier: string) {
  if (!identifier) return null;
  if (identifier.includes('@')) return identifier;
  try {
    const user = await User.findById(identifier).select('email').lean();
    return user?.email || null;
  } catch (err) {
    logger.warn({ err, identifier }, '[email] No se pudo resolver destinatario');
    return null;
  }
}

/**
 * Wrapper around the notification email sender that accepts either a direct
 * email address or a user identifier. If the recipient cannot be resolved, the
 * send is skipped but no error is thrown to avoid breaking the main flow.
 */
export async function sendEmail(identifier: string, subject: string, body: string, html?: string) {
  const to = await resolveRecipient(identifier);
  if (!to) {
    logger.warn({ identifier, subject }, '[email] Destinatario desconocido, se omite envío');
    return;
  }
  await deliverEmail(to, subject, body, html);
}

export async function sendPriceAlert(userId: string, property: any) {
  return sendEmail(
    userId,
    'Aviso: cambio de precio en propiedad',
    `La propiedad "${property.title}" ahora cuesta ${property.price} €`,
  );
}

export async function sendAvailabilityAlert(userId: string, property: any) {
  const range = property.availableTo
    ? `${property.availableFrom} - ${property.availableTo}`
    : property.availableFrom;

  return sendEmail(
    userId,
    'Aviso: cambio de disponibilidad',
    `La propiedad "${property.title}" tiene nueva fecha de disponibilidad: ${range}`,
  );
}

export async function sendContractCreatedEmail(to: string, contractId: string) {
  return sendEmail(
    to,
    'Nuevo contrato creado',
    `Se ha creado un nuevo contrato con ID ${contractId}.`,
  );
}
