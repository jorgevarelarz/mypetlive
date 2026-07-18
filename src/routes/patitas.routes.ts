import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { assertRole } from '../middleware/assertRole';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  listProtectoras,
  getPatitasBalance,
  getMyPatitas,
  getMyPatitasHistory,
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
} from '../controllers/patitas.controller';
import { getPosKeyStatus, rotatePosKey, listPosKeys, createPosKey, revokePosKey } from '../controllers/pos.controller';
import { getShelterPublicProfile } from '../controllers/shelter.controller';
import { shelterMetrics, partnerMetrics } from '../controllers/metrics.controller';

const router = Router();

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

// Usuario dona Patitas a una protectora.
router.post('/patitas/donate', ...assertRole('tenant', 'adoptante'), asyncHandler(donatePatitas));

// Identidad del usuario para ganar Patitas (QR que muestra el cliente).
router.get('/patitas/my-code', authenticate, asyncHandler(getMyCode));
router.post('/patitas/identify', ...assertRole('store', 'vet', 'admin'), asyncHandler(identifyUser));

// Generación por visita a tienda (el partner identifica al usuario).
router.post('/patitas/earn/visit', ...assertRole('store', 'vet', 'admin'), asyncHandler(earnVisit));

// Venta del partner: importe + ticket → comisión de plataforma + Patitas proporcionales.
router.post('/patitas/sales', ...assertRole('store', 'vet', 'admin'), asyncHandler(registerSale));
router.get('/patitas/sales/mine', ...assertRole('store', 'vet', 'admin'), asyncHandler(listMySales));

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
router.post('/patitas/redeem/preview', ...assertRole('store', 'vet'), asyncHandler(redeemPreview));
router.post('/patitas/redeem/confirm', ...assertRole('store', 'vet'), asyncHandler(redeemConfirm));

// Alta manual (admin).
router.post('/protectora/:id/patitas/add', authenticate, requireAdmin, asyncHandler(addPatitas));

export default router;
