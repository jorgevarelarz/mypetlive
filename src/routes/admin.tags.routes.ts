import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import * as ctrl from '../controllers/tag.controller';

// Fabricación de chapas (montado bajo /api/admin con requireAdmin).
const router = Router();

router.get('/tags', asyncHandler(ctrl.listTagBatches));
router.post('/tags/batch', asyncHandler(ctrl.createTagBatch));
// El `:batch` admite sufijo .csv para que el navegador descargue con nombre.
router.get('/tags/batch/:batch', asyncHandler(ctrl.exportTagBatch));
router.post('/tags/:code/revoke', asyncHandler(ctrl.revokeTag));

export default router;
