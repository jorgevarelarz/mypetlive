import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { platformMetrics } from '../controllers/metrics.controller';

// KPIs internos de plataforma (montado bajo /api/admin con requireAdmin).
const router = Router();

router.get('/metrics', asyncHandler(platformMetrics));

export default router;
