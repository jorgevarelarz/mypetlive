import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { assertRole } from '../middleware/assertRole';
import { getMine, setMine, getByProtectora } from '../controllers/questionnaire.controller';

const router = Router();

router.get('/questionnaire', ...assertRole('landlord', 'protectora', 'admin'), asyncHandler(getMine));
router.post('/questionnaire', ...assertRole('landlord', 'protectora', 'admin'), asyncHandler(setMine));
router.get('/questionnaire/:protectoraId', asyncHandler(getByProtectora));

export default router;
