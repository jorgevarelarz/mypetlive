import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { assertRole } from '../middleware/assertRole';
import {
  listVetOffers,
  createVetOffer,
  toggleVetOffer,
  deleteVetOffer,
} from '../controllers/vetOffers.controller';

const router = Router();

// El veterinario gestiona sus propias ofertas de servicio.
router.get('/vet/offers', ...assertRole('vet', 'admin'), asyncHandler(listVetOffers));
router.post('/vet/offers', ...assertRole('vet', 'admin'), asyncHandler(createVetOffer));
router.patch('/vet/offers/:id/toggle', ...assertRole('vet', 'admin'), asyncHandler(toggleVetOffer));
router.delete('/vet/offers/:id', ...assertRole('vet', 'admin'), asyncHandler(deleteVetOffer));

export default router;
