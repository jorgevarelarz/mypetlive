import { Router } from 'express';
import * as ctrl from '../controllers/rehome.controller';
import { requireAdmin } from '../middleware/requireAdmin';
import asyncHandler from '../utils/asyncHandler';

// Particulares que buscan casa a un animal suyo (cesión gratuita). Montado tras
// `authenticate`; quién puede publicar lo decide el admin (User.rehome).
const r = Router();

r.get('/status', asyncHandler(ctrl.status));
r.patch('/admin/users/:id', requireAdmin as any, asyncHandler(ctrl.adminSetRehome));

r.get('/animals', asyncHandler(ctrl.listMine));
r.post('/animals', asyncHandler(ctrl.createListing));
r.post('/animals/:id/withdraw', asyncHandler(ctrl.withdraw));

r.post('/adoptions/:adoptionId/choose', asyncHandler(ctrl.choose));
r.post('/adoptions/:adoptionId/reject', asyncHandler(ctrl.reject));

r.get('/contracts/:adoptionId', asyncHandler(ctrl.getContract));
r.post('/contracts/:adoptionId/sign', asyncHandler(ctrl.sign));
r.post('/contracts/:adoptionId/title-changed', asyncHandler(ctrl.titleChanged));

export default r;
