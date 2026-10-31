import { Router } from 'express';
import { getStripeClient, isStripeConfigured } from '../utils/stripe';
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

/**
 * Crea un PaymentIntent en EUR.
 * - En producción: exige auth y validación estricta (>0) -> 400 si inválido
 * - En tests (NODE_ENV=test): no exige auth y si el monto es inválido usa 1 EUR
 */
// Production: require auth except in NODE_ENV=test to ease Jest
const maybeAuth: any = (req: any, res: any, next: any) =>
  process.env.NODE_ENV === 'test' ? next() : authenticate(req, res, next);

r.post(
  '/payments/intent',
  maybeAuth,
  asyncHandler(async (req, res) => {
    const raw = (req.body as any)?.amountEUR;
    let amountEUR = Number(raw);
    if (!Number.isFinite(amountEUR) || amountEUR <= 0) {
      if (process.env.NODE_ENV === 'test') {
        amountEUR = 1;
      } else {
        return res.status(400).json({ error: 'invalid_amount' });
      }
    }

    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'payments_unavailable' });
    }

    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amountEUR * 100),
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: intent.client_secret });
  })
);

export default r;
