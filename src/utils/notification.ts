import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { isMock } from '../config/flags';
import logger from './logger';

const smtpConfigured = Boolean(process.env.SMTP_HOST);
const twilioConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);

const smtpPort = Number(process.env.SMTP_PORT) || 587;
// 465 usa TLS implícito (secure). Para 587/25 se usa STARTTLS (secure=false).
// Se puede forzar con SMTP_SECURE=true/false.
const smtpSecure =
  process.env.SMTP_SECURE !== undefined
    ? process.env.SMTP_SECURE === 'true'
    : smtpPort === 465;
const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      // El cert del Postfix de Plesk es para el hostname del servidor, no para
      // el dominio; permitir relajar la verificación TLS vía env si hace falta.
      tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false' },
    })
  : null;

const forceMockSms = isMock(process.env.SMS_PROVIDER);
const twilioClient = !forceMockSms && twilioConfigured
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const defaultFrom = process.env.SMTP_FROM || 'noreply@rental-app.com';

const deliverEmail = async (
  mailOptions: Record<string, unknown> & { to?: string; subject?: string; text?: string; from?: string }
) => {
  if (!mailOptions.from) {
    mailOptions.from = defaultFrom;
  }
  if (transporter) {
    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      logger.error({ err: error, to: mailOptions.to }, 'Error enviando email de notificación');
    }
  } else {
    logger.info(
      {
        to: mailOptions.to,
        subject: mailOptions.subject,
        bodyPreview: String(mailOptions.text || '').slice(0, 200),
      },
      '[Mock email]',
    );
  }
};

export const sendEmail = async (to: string, subject: string, body: string, html?: string) => {
  await deliverEmail({ to, subject, text: body, ...(html ? { html } : {}) });
};

export const sendRentReminderEmail = async (
  to: string,
  contractId: string,
  amount: number,
) => {
  await deliverEmail({
    to,
    subject: 'Recordatorio de pago de renta',
    text: `Le recordamos que la renta de €${amount} correspondiente al contrato ${contractId} vencerá pronto. Por favor, acceda a la plataforma para realizar el pago.`,
  });
};

export const sendContractRenewalNotification = async (
  to: string,
  contractId: string,
  endDate: string,
) => {
  await deliverEmail({
    to,
    subject: 'Próxima expiración de contrato',
    text: `Su contrato ${contractId} expirará el ${endDate}. Si desea renovar, póngase en contacto con la otra parte o inicie un nuevo contrato en la plataforma.`,
  });
};

export const notifyTenantProDecision = async (email: string, decision: 'approved' | 'rejected') => {
  const subject =
    decision === 'approved' ? 'Validación Tenant PRO aprobada' : 'Validación Tenant PRO rechazada';
  const text =
    decision === 'approved'
      ? 'Tu cuenta Tenant PRO ha sido aprobada. Ya puedes disfrutar de las ventajas de Only PRO.'
      : 'Tu solicitud Tenant PRO ha sido rechazada. Revisa la documentación y vuelve a intentarlo cuando estés listo.';
  await deliverEmail({ to: email, subject, text });
};

export const sendSms = async (phoneNumber: string, message: string) => {
  if (twilioClient) {
    try {
      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
      });
    } catch (error) {
      logger.error({ err: error, phoneNumber }, 'Error enviando SMS');
    }
  } else {
    logger.info({ phoneNumber, message }, `[Mock SMS${forceMockSms ? ' (forced)' : ''}]`);
  }
};

export const sendSMS = sendSms;
