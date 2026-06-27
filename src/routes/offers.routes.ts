import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { offersForAnimal, offersForMe } from '../controllers/offers.controller';

const router = Router();

// Ofertas personalizadas para un animal por su código (público).
router.get('/offers/for-animal/:code', asyncHandler(offersForAnimal));
// Ofertas para las mascotas del usuario autenticado.
router.get('/offers/for-me', authenticate, asyncHandler(offersForMe));

export default router;
