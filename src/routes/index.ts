import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { requireAdmin } from '../middleware/requireAdmin';
import { requireVerified } from '../middleware/requireVerified';
import { authenticate } from '../middleware/auth.middleware';

import adminEarningsRoutes from './admin.earnings.routes';
import adminRoutes from './admin.routes';
import adminTenantProRoutes from './admin.tenantPro.routes';
import applicationRoutes from './application.routes';
import appointmentsRoutes from './appointments.routes';
import authRoutes from './auth.routes';
import chatRoutes from './chat.routes';
import clausesRoutes from './clauses.routes';
import colivingRoutes from './coliving.routes';
import connectRoutes from './connect.routes';
import contractPaymentsRoutes from './contract.payments.routes';
import contractRoutes from './contract.routes';
import demoContractRoutes from './demoContract.routes';
import identityRoutes from './identity.routes';
import legalRoutes from './legal.routes';
import notifyRoutes from './notify.routes';
import paymentsRoutes from './payments.routes';
import postsignRoutes from './postsign';
import proRoutes from './pro.routes';
import propertyRoutes from './property.routes';
import animalRoutes from './animal.routes';
import adoptionRoutes from './adoption.routes';
import couponRoutes from './coupon.routes';
import couponAdminRoutes from './coupon.admin.routes';
import donationsRoutes from './donations.routes';
import patitasRoutes from './patitas.routes';
import questionnaireRoutes from './questionnaire.routes';
import purchaseRoutes from './purchase.routes';
import reviewRoutes from './review.routes';
import serviceOffersRoutes from './serviceOffers.routes';
import signatureRoutes from './signature.routes';

import tenantProMeRoutes from './tenantPro.me';
import tenantProRoutes from './tenantPro.routes';
import ticketRoutes from './ticket.routes';
import uploadRoutes from './upload.routes';
import userRoutes from './user.routes';
import verificationRoutes from './verification.routes';

const router = Router();

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

const tenantProLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
router.use('/auth', authLimiter, authRoutes);
router.use('/verification', verificationRoutes);
router.use('/kyc', identityRoutes);
router.use('/animals', animalRoutes);
router.use('/adoptions', adoptionRoutes);
router.use('/', couponRoutes);
router.use('/', donationsRoutes);
router.use('/', patitasRoutes);
router.use('/', questionnaireRoutes);
router.use('/legal', legalRoutes);
router.use('/upload', uploadRoutes);
router.use('/notify', notifyRoutes);
router.use('/appointments', requireVerified, appointmentsRoutes);

// [FROZEN RentalApp] Rutas de alquiler congeladas durante la migración a MyPetLive.
// router.use('/properties', propertyRoutes);
// router.use('/coliving', colivingRoutes);
// router.use('/clauses', clausesRoutes);
// router.use('/demo-contract', demoContractRoutes);
// router.use('/applications', applicationRoutes);
// router.use('/postsign', authenticate, postsignRoutes);
// router.use('/tenant-pro', tenantProLimiter, tenantProRoutes);
// router.use('/tenant-pro/me', tenantProMeRoutes);

// Protected routes (verified users)
router.use('/users', authenticate, requireVerified, userRoutes);
router.use('/reviews', authenticate, requireVerified, reviewRoutes);
router.use('/chat', authenticate, requireVerified, chatRoutes);
router.use('/payments', paymentsLimiter, paymentsRoutes);
router.use('/purchases', purchaseRoutes);

// [FROZEN RentalApp] Rutas protegidas de alquiler congeladas.
// router.use('/contracts', authenticate, requireVerified, contractRoutes);
// router.use('/pros', authenticate, requireVerified, proRoutes);
// router.use('/tickets', authenticate, requireVerified, ticketRoutes);
// router.use('/contract-payments', authenticate, requireVerified, contractPaymentsRoutes);
// router.use('/connect', authenticate, requireVerified, connectRoutes);
// router.use('/signature', authenticate, requireVerified, signatureRoutes);
// router.use('/service-offers', authenticate, requireVerified, serviceOffersRoutes);

// Admin
router.use('/admin', authenticate, requireVerified, requireAdmin, adminRoutes);
router.use('/admin/coupons', authenticate, requireVerified, requireAdmin, couponAdminRoutes);

// [FROZEN RentalApp] Admin de alquiler congelado.
// router.use('/admin/earnings', authenticate, requireVerified, requireAdmin, adminEarningsRoutes);
// router.use('/admin/tenant-pro', authenticate, requireVerified, requireAdmin, adminTenantProRoutes);

// Stripe webhook


export default router;
