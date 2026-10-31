import { z } from 'zod';
import logger from '../utils/logger';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'test', 'production']).optional(),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  MONGO_URL: z.string().optional(),
  MONGO_URI: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  TENANT_PRO_CONSENT_VERSION: z.string().default('v1'),
  TERMS_VERSION: z.string().default('v1'),
  PRIVACY_VERSION: z.string().default('v1'),
  ALLOW_UNVERIFIED: z.string().optional(),
  APP_URL: z.string().optional(),
  FRONTEND_URL: z.string().optional(),
  PASSWORD_RESET_URL: z.string().optional(),
  PASSWORD_RESET_URL_TEMPLATE: z.string().optional(),
  STRIPE_AUTOCREATE_MODE: z.enum(['lazy', 'eager', 'off']).default('lazy'),
});

export type Env = z.infer<typeof EnvSchema> & { MONGO: string };

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // No lanzamos en test/desarrollo por flexibilidad, pero mostramos detalle
    logger.warn({ details: parsed.error.flatten() }, '[env] Variables no válidas');
  }
  const e = (parsed.success ? parsed.data : (process.env as any)) as z.infer<typeof EnvSchema>;

  const MONGO = e.MONGO_URL || e.MONGO_URI || '';

  // APP_ENV es la señal explícita del despliegue cuando NODE_ENV no puede cambiarse.
  const production = e.NODE_ENV === 'production' || e.APP_ENV === 'production';

  // Validaciones estrictas en producción
  if (production) {
    if (!MONGO) throw new Error('MONGO_URL/MONGO_URI requerido en producción');
    if (!e.JWT_SECRET || e.JWT_SECRET.length < 16) {
      throw new Error('JWT_SECRET fuerte requerido en producción');
    }
    if (!e.CORS_ORIGIN) {
      logger.warn('[env] CORS_ORIGIN no definido en producción — se recomienda configurarlo');
    }
  }

  return { ...e, MONGO } as Env;
}
