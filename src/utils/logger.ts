import pino from 'pino';
import { censorLogValue, scrubDeep, scrubPii } from './redact';

const level = process.env.LOG_LEVEL ?? 'info';
const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

// Claves con datos personales o secretos, en el primer nivel o uno por debajo.
// Igual que RentalApp (9e132fd): los logs no guardan correos, teléfonos ni IBAN completos.
const REDACT_KEYS = ['to', 'email', 'phone', 'phoneNumber', 'iban', 'password', 'passwordHash', 'token', 'authorization', 'cookie'];
export const REDACT_PATHS = [
  ...REDACT_KEYS,
  ...REDACT_KEYS.map(key => `*.${key}`),
  'req.headers.authorization',
  'req.headers.cookie',
];

export const loggerOptions: pino.LoggerOptions = {
  level,
  redact: { paths: REDACT_PATHS, censor: censorLogValue },
  serializers: {
    // Los errores de SMTP, Brevo o Mongo (E11000) suelen llevar el correo en el mensaje.
    err: (err: Error) => scrubDeep(pino.stdSerializers.err(err)) as pino.SerializedError,
  },
  hooks: {
    logMethod(args, method) {
      method.apply(this, args.map(arg => (typeof arg === 'string' ? scrubPii(arg) : arg)) as Parameters<typeof method>);
    },
  },
};

const logger = pino({
  ...loggerOptions,
  enabled: !isTest || process.env.ENABLE_TEST_LOGS === 'true',
  transport: !isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export default logger;
