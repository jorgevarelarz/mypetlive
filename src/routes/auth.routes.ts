import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { register, login, requestPasswordReset, resetPassword } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import asyncHandler from '../utils/asyncHandler';

const router = Router();

const rateLimitHandler = (_req: unknown, res: any) =>
  res.status(429).json({
    code: 'too_many_attempts',
    message: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.',
  });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler,
});

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

const passwordRule = () =>
  body('password')
    .isString()
    .isLength({ min: 12, max: 72 })
    .custom(value => Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('password_must_be_12_to_72_bytes');

router.post(
  '/register',
  registrationLimiter,
  [
    body('name').isString().notEmpty(),
    body('email').isEmail(),
    passwordRule(),
  ],
  validate,
  asyncHandler(register),
);
router.post(
  '/login',
  loginLimiter,
  [body('email').isEmail(), body('password').isString().notEmpty()],
  validate,
  asyncHandler(login),
);
router.post(
  '/request-reset',
  recoveryLimiter,
  [body('email').isEmail()],
  validate,
  asyncHandler(requestPasswordReset),
);
router.post(
  '/reset',
  recoveryLimiter,
  [body('token').isString().notEmpty(), passwordRule()],
  validate,
  asyncHandler(resetPassword),
);
export default router;
