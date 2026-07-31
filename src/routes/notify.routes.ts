import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body as bodyValidator } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { requireVerified } from '../middleware/requireVerified';
import { validate } from '../middleware/validate';
import asyncHandler from '../utils/asyncHandler';
import { sendEmail, sendSms } from '../utils/notification';
import { authorizeRoles } from '../middleware/role.middleware';

const router = Router();

const notifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// SOLO ADMIN. Esto permite enviar un correo arbitrario, a una dirección
// arbitraria, con asunto y cuerpo arbitrarios y desde el dominio de MyPetLive:
// abierto a cualquier usuario verificado era un relay para phishing con nuestra
// marca (basta registrarse como adoptante). En MyPetLive no tiene ningún
// consumidor vivo — las páginas que lo llamaban (tickets, contratos) son
// legado de RentalApp y sus rutas solo redirigen a /home.
router.use(
  notifyLimiter,
  authenticate as any,
  requireVerified as any,
  authorizeRoles('admin') as any,
);

router.post(
  '/email',
  [
    bodyValidator('to').isEmail().withMessage('destinatario_invalido'),
    bodyValidator('subject').isString().trim().isLength({ min: 1, max: 180 }).withMessage('asunto_invalido'),
    bodyValidator('body').isString().isLength({ min: 1, max: 8000 }).withMessage('mensaje_invalido'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { to, subject, body } = req.body as { to: string; subject: string; body: string };
    await sendEmail(to, subject, body);
    res.json({ ok: true });
  })
);

router.post(
  '/sms',
  [
    bodyValidator('to').isMobilePhone('any').withMessage('destinatario_invalido'),
    bodyValidator('body').isString().isLength({ min: 1, max: 640 }).withMessage('mensaje_invalido'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { to, body } = req.body as { to: string; body: string };
    await sendSms(to, body);
    res.json({ ok: true });
  })
);

export default router;
