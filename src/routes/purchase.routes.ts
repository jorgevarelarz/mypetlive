import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { assertRole } from '../middleware/assertRole';
import { recordPurchase } from '../controllers/purchase.controller';

const router = Router();

router.post('/', ...assertRole('store', 'vet'), asyncHandler(recordPurchase));

export default router;
