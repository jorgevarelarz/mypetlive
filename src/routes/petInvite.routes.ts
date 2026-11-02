import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/petSharing.controller';
import { authenticate } from '../middleware/auth.middleware';
import asyncHandler from '../utils/asyncHandler';

// Quien recibe la invitación a compartir una mascota (ver petSharing.controller).
const r = Router();

// El token se prueba a ciegas desde fuera: tope por IP.
const previewLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

r.get('/token/:token', previewLimiter, asyncHandler(ctrl.previewByToken));
r.get('/mine', authenticate, asyncHandler(ctrl.listMine));
r.post('/accept', authenticate, asyncHandler(ctrl.accept));
r.post('/decline', authenticate, asyncHandler(ctrl.decline));

export default r;
