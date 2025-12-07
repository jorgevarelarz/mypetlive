import { Router } from 'express';
import { getStripeClient, isStripeConfigured } from '../utils/stripe';
import { User } from '../models/user.model';

const r = Router();

// Create or retrieve Express account and return onboarding link
r.post('/connect/owner/link', async (req, res) => {
  const ownerId = (req as any).user?._id || (req as any).user?.id;
  if (!ownerId) return res.status(401).json({ error: 'unauthorized' });

  const owner = await User.findById(ownerId);
  if (!owner) return res.status(404).json({ error: 'owner_not_found' });

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'payments_unavailable' });
  }

  const stripe = getStripeClient();

  if (!owner.stripeAccountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'ES',
      email: owner.email,
      business_type: 'individual',
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      business_profile: {
        mcc: '6513',
        product_description: 'Cobro de rentas y fianzas entre inquilinos y propietarios',
      },
    });
    owner.stripeAccountId = account.id;
    await owner.save();
  }

  const link = await stripe.accountLinks.create({
    account: owner.stripeAccountId!,
    refresh_url: `${process.env.APP_URL}/connect/refresh`,
    return_url: `${process.env.APP_URL}/connect/return`,
    type: 'account_onboarding',
  });

  res.json({ accountId: owner.stripeAccountId, url: link.url });
});

// Retrieve account status
r.get('/connect/owner/status', async (req, res) => {
  const ownerId = (req as any).user?._id || (req as any).user?.id;
  if (!ownerId) return res.status(401).json({ error: 'unauthorized' });

  const owner = await User.findById(ownerId).lean();
  if (!owner?.stripeAccountId) return res.json({ connected: false });

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'payments_unavailable' });
  }
  const stripe = getStripeClient();
  const acct = await stripe.accounts.retrieve(owner.stripeAccountId);
  res.json({
    connected: true,
    charges_enabled: acct.charges_enabled,
    payouts_enabled: acct.payouts_enabled,
    requirements: acct.requirements,
  });
});

export default r;
