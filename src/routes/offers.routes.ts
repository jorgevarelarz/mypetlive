import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { assertRole } from '../middleware/assertRole';
import { offersForAnimal, offersForMe, sponsorCoupon } from '../controllers/offers.controller';

const router = Router();

// Ofertas personalizadas para un animal por su código (público).
router.get('/offers/for-animal/:code', asyncHandler(offersForAnimal));
// Ofertas para las mascotas del usuario autenticado.
router.get('/offers/for-me', authenticate, asyncHandler(offersForMe));
// El partner (o admin) paga para destacar su cupón (placement patrocinado).
router.post('/offers/coupons/:id/sponsor', ...assertRole('store', 'vet', 'admin'), asyncHandler(sponsorCoupon));

export default router;
