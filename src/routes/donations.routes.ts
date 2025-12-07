import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { isStripeConfigured, getStripeClient } from '../utils/stripe';
import { Donation } from '../models/donation.model';

const r = Router();

r.post(
  '/donations/checkout-session',
  authenticate,
  asyncHandler(async (req: any, res) => {
    const userId = req.user?.id || req.user?._id;
    const { amountEUR, animalId } = req.body as { amountEUR: number; animalId?: string };
    const amount = Math.round(Number(amountEUR || 0) * 100);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'invalid_amount' });
    if (!isStripeConfigured()) return res.status(503).json({ error: 'payments_unavailable' });
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'Donación' },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: { donation: 'true', userId: String(userId || ''), animalId: String(animalId || '') },
      success_url: (process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:3001') + '/?donation=success',
      cancel_url: (process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:3001') + '/?donation=cancel',
    });

    await Donation.create({ userId: String(userId || ''), animalId, amount, currency: 'eur', status: 'pending', sessionId: session.id });
    res.json({ id: session.id, url: session.url });
  })
);

export default r;

