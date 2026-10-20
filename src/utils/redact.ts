// Enmascarado de datos personales para los logs. Deja lo justo para depurar
// (dominio del correo, últimas cifras) sin guardar el dato completo.
// No importa el logger: lo usa logger.ts.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Solo teléfonos con prefijo internacional, para no tocar importes ni IDs.
const PHONE_RE = /\+\d[\d\s().-]{7,}\d/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){10,30}\b/g;

/** «jorge@gmail.com» → «j***@gmail.com». Aplicarlo dos veces no cambia nada. */
export const maskEmail = (email: string): string => {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
};

/** «+34 600 123 456» → «***456». */
export const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 3 ? `***${digits.slice(-3)}` : '***';
};

/** «ES9121000418450200051332» → «ES91****1332». */
export const maskIban = (iban: string): string => {
  const compact = iban.replace(/\s/g, '');
  return compact.length > 8 ? `${compact.slice(0, 4)}****${compact.slice(-4)}` : '****';
};

/** Enmascara correos, teléfonos internacionales e IBAN dentro de un texto libre. */
export const scrubPii = (text: string): string =>
  text.replace(EMAIL_RE, maskEmail).replace(IBAN_RE, maskIban).replace(PHONE_RE, maskPhone);

/** Aplica scrubPii a todas las cadenas de un valor (objetos y arrays anidados, con tope de profundidad). */
export const scrubDeep = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') return scrubPii(value);
  if (!value || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.map((item) => scrubDeep(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = scrubDeep(item, depth + 1);
  }
  return out;
};

const SECRET_KEYS = new Set(['password', 'passwordHash', 'token', 'authorization', 'cookie']);

/** Censura de pino `redact`: oculta secretos y enmascara el resto según la clave. */
export const censorLogValue = (value: unknown, path: string[]): unknown => {
  const key = path[path.length - 1];
  if (SECRET_KEYS.has(key)) return '[oculto]';
  if (Array.isArray(value)) return value.map((item) => censorLogValue(item, path));
  if (typeof value !== 'string') return value;
  if (key === 'phone' || key === 'phoneNumber') return maskPhone(value);
  if (key === 'iban') return maskIban(value);
  return scrubPii(value);
};
