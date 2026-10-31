import { Router } from 'express';
import { isStripeConfigured } from '../utils/stripe';
import { User } from '../models/user.model';
import { authenticate } from '../middleware/auth.middleware';
import asyncHandler from '../utils/asyncHandler';
import { ensureStripeCustomerForUser } from '../core/stripeCustomer';

const r = Router();

/**
 * Crea (si no existe) o devuelve el Stripe Customer del usuario autenticado.
 */
r.post(
  '/payments/customer',
  authenticate,
  asyncHandler(async (req: any, res) => {
    // `authenticate` ya ha corrido: si no hubiera usuario habría devuelto 401.
    // El header `x-user-id` NO se mira aquí (era controlable por el cliente).
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: 'missing_user' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'payments_unavailable' });
    }

    const result = await ensureStripeCustomerForUser(String(user._id), 'payments_endpoint', { allowRetry: false });

    const freshUser = await User.findById(userId);
    const customerId = freshUser?.stripeCustomerId;
    if (!customerId) {
      const expose = result.status === 'created' || result.status === 'already_exists';
      if (!expose) {
        return res.status(503).json({ error: 'payments_unavailable' });
      }
      return res.status(503).json({ error: 'customer_missing' });
    }

    res.json({ customerId });
  })
);

export default r;
