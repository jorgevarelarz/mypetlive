import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { assertRole } from '../middleware/assertRole';
import { authenticate } from '../middleware/auth.middleware';
import { requireVerified } from '../middleware/requireVerified';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  addPatitas,
  echoPatita,
  getPatitasBalance,
  spendPatitas,
  listPendingPatitas,
  confirmPatita,
  listProtectoras,
} from '../controllers/patitas.controller';

const router = Router();

router.get('/protectoras', asyncHandler(listProtectoras));

router.get(
  '/protectora/patitas',
  ...assertRole('tenant', 'landlord', 'protectora', 'admin'),
  asyncHandler(getPatitasBalance),
);

router.post('/patitas/echo', ...assertRole('tenant', 'adoptante'), asyncHandler(echoPatita));

router.post(
  '/patitas/spend',
  ...assertRole('landlord', 'protectora', 'admin'),
  asyncHandler(spendPatitas),
);

router.get('/patitas/pending', ...assertRole('store', 'vet', 'admin'), asyncHandler(listPendingPatitas));
router.post('/patitas/confirm', ...assertRole('store', 'vet', 'admin'), asyncHandler(confirmPatita));

router.post(
  '/protectora/:id/patitas/add',
  authenticate,
  requireVerified,
  requireAdmin,
  asyncHandler(addPatitas),
);

export default router;
