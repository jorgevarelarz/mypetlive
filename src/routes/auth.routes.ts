import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, requestPasswordReset, resetPassword } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import asyncHandler from '../utils/asyncHandler';

const router = Router();
router.post(
  '/register',
  [
    body('name').isString().notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
  ],
  validate,
  asyncHandler(register),
);
router.post(
  '/login',
  [body('email').isEmail(), body('password').isString().notEmpty()],
  validate,
  asyncHandler(login),
);
router.post(
  '/request-reset',
  [body('email').isEmail()],
  validate,
  asyncHandler(requestPasswordReset),
);
router.post(
  '/reset',
  [body('token').isString().notEmpty(), body('password').isLength({ min: 6 })],
  validate,
  asyncHandler(resetPassword),
);
export default router;
