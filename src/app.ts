import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';

import { purgeOldTenantProDocs } from './jobs/tenantProRetention';
import logger from './utils/logger';

import stripeWebhookRoutes from './routes/stripe.webhook';

import authRoutes from './routes/auth.routes';
import seoRoutes from './routes/seo.routes';
import verificationRoutes from './routes/verification.routes';
import identityRoutes from './routes/identity.routes';
import propertyRoutes from './routes/property.routes';
import clausesRoutes from './routes/clauses.routes';
import legalRoutes from './routes/legal.routes';
import uploadRoutes from './routes/upload.routes';
import demoContractRoutes from './routes/demoContract.routes';
import notifyRoutes from './routes/notify.routes';
import postsignRouter from './routes/postsign';
import tenantProRoutes from './routes/tenantPro.routes';
import tenantProMeRoutes from './routes/tenantPro.me';
import appointmentsRoutes from './routes/appointments.routes';
import contractRoutes, { contractPublicRoutes } from './routes/contract.routes';
import userRoutes from './routes/user.routes';
import proRoutes from './routes/pro.routes';
import ticketRoutes from './routes/ticket.routes';
import reviewRoutes from './routes/review.routes';
import chatRoutes from './routes/chat.routes';
import contractPaymentsRoutes from './routes/contract.payments.routes';
import paymentsRoutes from './routes/payments.routes';
import connectRoutes from './routes/connect.routes';
import signatureRoutes from './routes/signature.routes';
import serviceOffersRoutes from './routes/serviceOffers.routes';
import adminRoutes from './routes/admin.routes';
import adminEarningsRoutes from './routes/admin.earnings.routes';
import adminSalesRoutes from './routes/admin.sales.routes';
import adminTenantProRoutes from './routes/admin.tenantPro.routes';
import applicationRoutes from './routes/application.routes';
import colivingRoutes from './routes/coliving.routes';
import animalRoutes from './routes/animal.routes';
import adoptionRoutes from './routes/adoption.routes';
import donationsRoutes from './routes/donations.routes';
import patitasRoutes from './routes/patitas.routes';
import couponRoutes from './routes/coupon.routes';
import offersRoutes from './routes/offers.routes';
import vetAppointmentRoutes from './routes/vetAppointment.routes';
import vetOffersRoutes from './routes/vetOffers.routes';
import adminCouponRoutes from './routes/coupon.admin.routes';
import purchaseRoutes from './routes/purchase.routes';
import questionnaireRoutes from './routes/questionnaire.routes';
import { ensureAnimalCodes } from './models/animal.model';

import { errorHandler } from './middleware/errorHandler';
import { requireAdmin } from './middleware/requireAdmin';
import { authenticate } from './middleware/auth.middleware';

const globalAny = globalThis as typeof globalThis & { __rentalAppProcessHandlers?: boolean };
if (!globalAny.__rentalAppProcessHandlers) {
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error({ err }, 'Unhandled promise rejection detected');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception detected');
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

  globalAny.__rentalAppProcessHandlers = true;
}

import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import { requestId } from './middleware/requestId';
import { loadEnv } from './config/env';
import { metricsMiddleware, metricsHandler } from './metrics';

const env = loadEnv();

const app = express();
// La API corre detrás del proxy Apache de Plesk (mod_proxy). Confiar en 1 salto
// para que req.ip use X-Forwarded-For y express-rate-limit identifique a cada
// usuario por su IP real (sin esto, todos comparten un único bucket de rate-limit).
app.set('trust proxy', 1);
// Endurecer cabeceras y parámetros
app.disable('x-powered-by');
app.set('etag', false);
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy:
      process.env.NODE_ENV === 'production'
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:', 'http:'],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              connectSrc: [
                "'self'",
                ...(process.env.CORS_ORIGIN || '')
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean),
              ],
            },
          }
        : false,
    hsts: process.env.NODE_ENV === 'production' ? undefined : false,
  }),
);

// ID de solicitud para trazabilidad
app.use(requestId);
// Compresión (si el paquete está disponible)
let compressionFn: any;
try {
  compressionFn = require('compression');
} catch {}
if (compressionFn) {
  app.use(compressionFn());
}
app.use(metricsMiddleware);

app.use(morgan('dev'));

app.use('/api', stripeWebhookRoutes);

const allowedOrigins = (
  process.env.CORS_ORIGIN ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000,http://localhost:3001')
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-admin', 'x-user-id'],
    exposedHeaders: ['Content-Disposition'],
    credentials: true,
  }),
);

app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      const originalUrl = (req as any).originalUrl || req.url || '';
      if (
        originalUrl.startsWith('/api/contracts') &&
        originalUrl.includes('/signature/callback')
      ) {
        (req as any).rawBody = Buffer.from(buf);
      }
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// Proteger contra HTTP Parameter Pollution en query; no tocar body JSON para evitar falsos positivos
app.use(hpp({ checkBody: false, checkQuery: true }));
// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const tenantProLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/health', (_req, res) =>
  res.json({ ok: true, env: process.env.NODE_ENV, mongo: { state: mongoose.connection.readyState } }),
);
// Alias: /api/health redirige al endpoint canónico /health (evita romper clientes antiguos)
app.get('/api/health', (_req, res) => res.redirect(301, '/health'));
app.get('/metrics', metricsHandler);

// Public routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/kyc', identityRoutes);
app.use('/api', legalRoutes);
app.use('/api', uploadRoutes);
app.use('/api/notify', notifyRoutes);
// SEO / Open Graph (público, sin auth): /sitemap.xml y /og/animals/:id (para bots).
app.use(seoRoutes);
// [FROZEN RentalApp] Mounts de alquiler desactivados durante la migración a MyPetLive.
// OJO: postsign y appointments montaban authenticate/requireVerified sobre '/api' global,
// lo que bloqueaba el catálogo público de animales. Congelados aquí.
// app.use('/api', propertyRoutes);
// app.use('/api', clausesRoutes);
// app.use('/api', demoContractRoutes);
// app.use('/api', authenticate, postsignRouter);
// app.use('/api/tenant-pro', tenantProLimiter);
// app.use('/api', tenantProRoutes);
// app.use('/api', tenantProMeRoutes);
// app.use('/api', requireVerified, appointmentsRoutes);
// app.use('/api/applications', applicationRoutes);
// app.use('/api/coliving', colivingRoutes);
// Rental routes/UI preserved but hidden for tenants — kept for future reuse
app.use('/api/animals', animalRoutes);
app.use('/api/adoptions', adoptionRoutes);
app.use('/api', donationsRoutes);
app.use('/api', patitasRoutes);
app.use('/api', couponRoutes);
app.use('/api', offersRoutes);
app.use('/api', vetAppointmentRoutes);
app.use('/api', vetOffersRoutes);
app.use('/api/purchases', purchaseRoutes);

app.use(
  '/api/admin/coupons',
  authenticate,
  requireAdmin,
  adminCouponRoutes,
);
app.use('/api', questionnaireRoutes);

// Protected routes (autenticación + rol; sin verificación KYC — adopción libre)
app.use('/api/users', authenticate, userRoutes);
app.use('/api/reviews', authenticate, reviewRoutes);
app.use('/api/chat', authenticate, chatRoutes);
app.use('/api/payments', paymentsLimiter);
app.use('/api', paymentsRoutes);
// [FROZEN RentalApp] Rutas protegidas de alquiler congeladas.
// app.use('/api/contracts', contractPublicRoutes);
// app.use('/api/contracts', authenticate, requireVerified, contractRoutes);
// app.use('/api', authenticate, requireVerified, contractPaymentsRoutes);
// app.use('/api/pros', authenticate, requireVerified, proRoutes);
// app.use('/api/tickets', authenticate, requireVerified, ticketRoutes);
// Stripe Connect: onboarding de cobro para protectoras (donaciones). Sin requireVerified.
app.use('/api', authenticate, connectRoutes);
// app.use('/api', authenticate, requireVerified, signatureRoutes);
// app.use('/api', authenticate, requireVerified, serviceOffersRoutes);

// Admin
app.use(
  '/api/admin',
  authenticate,
  requireAdmin,
  adminRoutes,
  adminEarningsRoutes,
  adminSalesRoutes,
  adminTenantProRoutes,
);

// Error handler
app.use(errorHandler);

const PORT = env.PORT || 3000;
const mongoUrl = env.MONGO || '';

let server: any;

if (mongoUrl) {
  mongoose
    .connect(mongoUrl)
    .then(() => {
      if (process.env.NODE_ENV !== 'test') {
        void ensureAnimalCodes().catch(err => logger.warn({ err }, 'No se pudieron asignar códigos a todos los animales'));
        server = app.listen(PORT, () => logger.info(`Servidor en http://localhost:${PORT}`));
        setInterval(() => purgeOldTenantProDocs().catch(() => {}), 6 * 60 * 60 * 1000);
      }
    })
    .catch(err => logger.error({ err }, 'Error al conectar a MongoDB'));
} else if (process.env.NODE_ENV !== 'test') {
  logger.warn('Mongo URL no configurada; la conexión a la base de datos se omitirá');
}
// Apagado elegante
if (process.env.NODE_ENV !== 'test') {
  const shutdown = async (signal: string) => {
    try {
      logger.info(`[shutdown] Señal recibida: ${signal}`);
      if (server) {
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
      await mongoose.connection.close().catch(() => {});
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

export { app, server };
export default app;
