import { Router } from 'express';
import * as ctrl from '../controllers/found.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import asyncHandler from '../utils/asyncHandler';

// Animales encontrados. La lista y la ficha son públicas (para que su familia
// lo encuentre); lo demás pide sesión. Montado ANTES de app.use('/api',
// authenticate, …): si no, la parte pública daría 401.
const r = Router();

r.get('/', optionalAuthenticate as any, asyncHandler(ctrl.listPublic));
r.get('/mine', authenticate as any, asyncHandler(ctrl.listMine));
r.get('/shelters', authenticate as any, asyncHandler(ctrl.shelters));
r.get('/:id', optionalAuthenticate as any, asyncHandler(ctrl.getOne));
r.post('/', authenticate as any, asyncHandler(ctrl.create));
r.patch('/:id/steps', authenticate as any, asyncHandler(ctrl.updateSteps));
r.post('/:id/close', authenticate as any, asyncHandler(ctrl.close));
r.post('/:id/claim', authenticate as any, asyncHandler(ctrl.claim));
r.post('/:id/foster', authenticate as any, asyncHandler(ctrl.requestFoster));
r.post('/:id/foster/accept', authenticate as any, asyncHandler(ctrl.acceptFoster));
r.post('/:id/foster/reject', authenticate as any, asyncHandler(ctrl.rejectFoster));
r.get('/:id/agreement', authenticate as any, asyncHandler(ctrl.getAgreement));
r.post('/:id/agreement/sign', authenticate as any, asyncHandler(ctrl.signAgreement));

export default r;
