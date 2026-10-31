import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import asyncHandler from '../utils/asyncHandler';
import { assertRole } from '../middleware/assertRole';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  listProtectoras,
  getPatitasBalance,
  getMyPatitas,
  getMyPatitasHistory,
  getMyPatitasImpact,
  donatePatitas,
  earnVisit,
  getWalletToken,
  redeemPreview,
  redeemConfirm,
  addPatitas,
  getMyCode,
  identifyUser,
  registerSale,
  listMySales,
  listMyStatements,
} from '../controllers/patitas.controller';
import { getPosKeyStatus, rotatePosKey, listPosKeys, createPosKey, revokePosKey } from '../controllers/pos.controller';
import { getShelterPublicProfile } from '../controllers/shelter.controller';
import { shelterMetrics, partnerMetrics } from '../controllers/metrics.controller';

const router = Router();

// Intentos fallidos de identificación y canje por partner (no por IP): frena la
// fuerza bruta de códigos. Solo cuentan las respuestas >= 400 y el contador es
// compartido entre identify, preview y confirm.
const redeemAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req: any) => String(req.user._id || req.user.id),
  handler: (_req, res) =>
    res.status(429).json({
      code: 'too_many_attempts',
      message: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.',
    }),
});

router.get('/protectoras', asyncHandler(listProtectoras));

// Perfil público de presentación de una protectora (sin auth): info + contadores.
router.get('/protectoras/:id/profile', asyncHandler(getShelterPublicProfile));

// Saldo de protectora (dashboard).
router.get(
  '/protectora/patitas',
  ...assertRole('tenant', 'landlord', 'protectora', 'admin'),
  asyncHandler(getPatitasBalance),
);

// Wallet del usuario/protectora autenticado: saldo + valor € + histórico.
router.get('/patitas/me', authenticate, asyncHandler(getMyPatitas));
router.get('/patitas/history', authenticate, asyncHandler(getMyPatitasHistory));
router.get('/patitas/me/impact', authenticate, asyncHandler(getMyPatitasImpact));

// Usuario dona Patitas a una protectora.
router.post('/patitas/donate', ...assertRole('tenant', 'adoptante'), asyncHandler(donatePatitas));

// Identidad del usuario para ganar Patitas (QR que muestra el cliente).
router.get('/patitas/my-code', authenticate, asyncHandler(getMyCode));
router.post('/patitas/identify', ...assertRole('store', 'vet', 'admin'), redeemAttemptLimiter, asyncHandler(identifyUser));

// Generación por visita a tienda (el partner identifica al usuario).
router.post('/patitas/earn/visit', ...assertRole('store', 'vet', 'admin'), asyncHandler(earnVisit));

// Venta del partner: importe + ticket → comisión de plataforma + Patitas proporcionales.
router.post('/patitas/sales', ...assertRole('store', 'vet', 'admin'), asyncHandler(registerSale));
router.get('/patitas/sales/mine', ...assertRole('store', 'vet', 'admin'), asyncHandler(listMySales));
// Extracto mensual de liquidación de comisiones del partner (json o csv).
router.get('/patitas/sales/statements', ...assertRole('store', 'vet', 'admin'), asyncHandler(listMyStatements));

// Métricas: retorno visible para protectora y partner (P2 gap analysis).
router.get('/protectoras/me/metrics', ...assertRole('landlord', 'protectora', 'admin'), asyncHandler(shelterMetrics));
router.get('/partners/me/metrics', ...assertRole('store', 'vet', 'admin'), asyncHandler(partnerMetrics));

// Clave API del TPV del partner (integración de caja): estado y generación/rotación.
// [LEGADO] Clave única; las nuevas integraciones usan /partners/me/pos-keys.
router.get('/partners/me/pos-key', ...assertRole('store', 'vet'), asyncHandler(getPosKeyStatus));
router.post('/partners/me/pos-key', ...assertRole('store', 'vet'), asyncHandler(rotatePosKey));

// Claves del TPV con etiqueta y revocación individual (varias cajas) + modo test.
router.get('/partners/me/pos-keys', ...assertRole('store', 'vet'), asyncHandler(listPosKeys));
router.post('/partners/me/pos-keys', ...assertRole('store', 'vet'), asyncHandler(createPosKey));
router.delete('/partners/me/pos-keys/:keyId', ...assertRole('store', 'vet'), asyncHandler(revokePosKey));

// Protectora: token + código de su wallet para el QR de canje.
router.get('/patitas/wallet/token', ...assertRole('landlord', 'protectora'), asyncHandler(getWalletToken));

// Canje partner ← protectora.
router.post('/patitas/redeem/preview', ...assertRole('store', 'vet'), redeemAttemptLimiter, asyncHandler(redeemPreview));
router.post('/patitas/redeem/confirm', ...assertRole('store', 'vet'), redeemAttemptLimiter, asyncHandler(redeemConfirm));

// Alta manual (admin).
router.post('/protectora/:id/patitas/add', authenticate, requireAdmin, asyncHandler(addPatitas));

export default router;
