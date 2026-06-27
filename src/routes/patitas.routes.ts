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
  echoPatita,
  spendPatitas,
  getMyCode,
  identifyUser,
} from '../controllers/patitas.controller';

const router = Router();

router.get('/protectoras', asyncHandler(listProtectoras));

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

// Protectora: token + código de su wallet para el QR de canje.
router.get('/patitas/wallet/token', ...assertRole('landlord', 'protectora'), asyncHandler(getWalletToken));

// Canje partner ← protectora.
router.post('/patitas/redeem/preview', ...assertRole('store', 'vet'), asyncHandler(redeemPreview));
router.post('/patitas/redeem/confirm', ...assertRole('store', 'vet'), asyncHandler(redeemConfirm));

// "Dar Patita" social + gasto directo (legado).
router.post('/patitas/echo', ...assertRole('tenant', 'adoptante'), asyncHandler(echoPatita));
router.post('/patitas/spend', ...assertRole('landlord', 'protectora', 'admin'), asyncHandler(spendPatitas));

// Alta manual (admin).
router.post('/protectora/:id/patitas/add', authenticate, requireAdmin, asyncHandler(addPatitas));

export default router;
