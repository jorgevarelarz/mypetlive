import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { posIdentify, posSale } from '../controllers/pos.controller';
import logger from '../utils/logger';

// API del TPV del partner. Se monta bajo /api/pos con el middleware posAuth
// (autenticación por X-Api-Key), sin sesión de navegador.
const router = Router();

// Log estructurado por llamada (partner, modo, endpoint, status, latencia):
// soporte ("¿está llamando tu caja?") y disputas de comisión.
router.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const partner: any = (req as any).user;
    logger.info(
      {
        pos: true,
        partnerId: partner ? String(partner._id) : null,
        mode: (req as any).posKeyMode || 'live',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
      },
      'pos_api_call',
    );
  });
  next();
});

router.post('/identify', asyncHandler(posIdentify));
router.post('/sales', asyncHandler(posSale));

export default router;
