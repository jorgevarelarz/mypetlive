import { Router } from 'express';
import { Types } from 'mongoose';
import asyncHandler from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { isStripeConfigured, getStripeClient } from '../utils/stripe';
import { Donation } from '../models/donation.model';
import { Animal } from '../models/animal.model';
import { User } from '../models/user.model';
import { canReceiveDonations } from '../utils/shelterVerification';

const r = Router();

// Comisión de gestión de la plataforma (porcentaje del importe donado). Configurable por entorno.
const DONATION_FEE_PERCENT = Math.max(0, Math.min(50, Number(process.env.DONATION_FEE_PERCENT ?? 5)));

r.post(
  '/donations/checkout-session',
  authenticate,
  asyncHandler(async (req: any, res) => {
    const userId = req.user?.id || req.user?._id;
    const { amountEUR, animalId, shelterId: bodyShelterId } = req.body as { amountEUR: number; animalId?: string; shelterId?: string };
    const amount = Math.round(Number(amountEUR || 0) * 100);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'invalid_amount' });
    if (!isStripeConfigured()) return res.status(503).json({ error: 'payments_unavailable' });

    // Resolver la protectora destinataria (modelo fiscal: el dinero va directo a su cuenta).
    let shelterId: string | undefined = bodyShelterId && Types.ObjectId.isValid(bodyShelterId) ? bodyShelterId : undefined;
    if (!shelterId && animalId && Types.ObjectId.isValid(animalId)) {
      const animal = await Animal.findById(animalId).select('shelter').lean();
      if (animal?.shelter) shelterId = String(animal.shelter);
    }
    if (!shelterId) return res.status(400).json({ error: 'shelter_required' });
    if (!(await canReceiveDonations(String(shelterId)))) return res.status(403).json({ error: 'shelter_verification_required' });

    const shelter = await User.findById(shelterId).select('stripeAccountId role').lean();
    if (!shelter || !shelter.stripeAccountId) return res.status(409).json({ error: 'shelter_payouts_not_ready' });

    const stripe = getStripeClient();
    // Verificar que la cuenta conectada puede cobrar antes de enrutar fondos.
    const acct = await stripe.accounts.retrieve(shelter.stripeAccountId);
    if (!acct.charges_enabled) return res.status(409).json({ error: 'shelter_payouts_not_ready' });

    const fee = Math.round((amount * DONATION_FEE_PERCENT) / 100);
    const base = process.env.FRONTEND_URL?.replace(/\/$/, '') || process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:3001';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'Donación a protectora' },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      // Destination charge: la donación va a la cuenta conectada de la protectora,
      // la plataforma retiene su comisión de gestión (application_fee_amount).
      payment_intent_data: {
        application_fee_amount: fee,
        transfer_data: { destination: shelter.stripeAccountId },
      },
      metadata: { donation: 'true', userId: String(userId || ''), animalId: String(animalId || ''), shelterId: String(shelterId) },
      success_url: base + '/?donation=success',
      cancel_url: base + '/?donation=cancel',
    });

    await Donation.create({ userId: String(userId || ''), animalId, amount, currency: 'eur', status: 'pending', sessionId: session.id });
    res.json({ id: session.id, url: session.url });
  })
);

export default r;
