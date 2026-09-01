import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import asyncHandler from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/tag.controller';

const r = Router();

// Resolver la chapa es público y anónimo a propósito: quien se encuentra un
// perro por la calle no tiene cuenta ni la va a crear. Pero es una escritura
// (incrementa el contador de escaneos), así que va limitada por IP.
const scanLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// `/mine` va antes que `/:code` — si no, la ruta dinámica se traga "mine" y
// devuelve tag_not_found. Es exactamente el fallo que tuvo `/legal/status`.
r.get('/mine', authenticate, asyncHandler(ctrl.listMyTags));
r.get('/:code', scanLimiter, asyncHandler(ctrl.resolveTag));

// Asignar y liberar exigen sesión y ser quien gestiona el animal.
r.post('/:code/claim', authenticate, asyncHandler(ctrl.claimTag));
r.post('/:code/release', authenticate, asyncHandler(ctrl.releaseTag));

export default r;
