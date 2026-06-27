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

// ---------------------------------------------------------------------------
// Cobro de donaciones de la protectora (modelo de comisión: el dinero va directo
// a la cuenta conectada de la protectora y la plataforma retiene su fee). El IBAN
// real lo recoge Stripe en el onboarding KYC; nosotros no lo almacenamos.
// ---------------------------------------------------------------------------

function frontendBase(): string {
  return (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

// Crea/recupera la cuenta Express de la protectora y devuelve el enlace de onboarding.
r.post('/connect/shelter/link', async (req, res) => {
  const shelterId = (req as any).user?._id || (req as any).user?.id;
  if (!shelterId) return res.status(401).json({ error: 'unauthorized' });

  const shelter = await User.findById(shelterId);
  if (!shelter) return res.status(404).json({ error: 'shelter_not_found' });
  if (!['landlord', 'admin'].includes(String(shelter.role))) {
    return res.status(403).json({ error: 'only_shelters' });
  }
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'payments_unavailable' });
  }

  const stripe = getStripeClient();
  if (!shelter.stripeAccountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'ES',
      email: shelter.email,
      business_type: 'non_profit',
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      business_profile: {
        mcc: '8398', // Organizaciones de servicios sociales / caritativas
        product_description: 'Recepción de donaciones para una protectora de animales',
      },
    });
    shelter.stripeAccountId = account.id;
    await shelter.save();
  }

  const base = frontendBase();
  const link = await stripe.accountLinks.create({
    account: shelter.stripeAccountId!,
    refresh_url: `${base}/profile?connect=refresh`,
    return_url: `${base}/profile?connect=return`,
    type: 'account_onboarding',
  });

  res.json({ accountId: shelter.stripeAccountId, url: link.url });
});

// Estado de la cuenta de cobro de la protectora.
r.get('/connect/shelter/status', async (req, res) => {
  const shelterId = (req as any).user?._id || (req as any).user?.id;
  if (!shelterId) return res.status(401).json({ error: 'unauthorized' });

  const shelter = await User.findById(shelterId).lean();
  if (!shelter?.stripeAccountId) return res.json({ connected: false, charges_enabled: false, payouts_enabled: false });

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'payments_unavailable' });
  }
  const stripe = getStripeClient();
  const acct = await stripe.accounts.retrieve(shelter.stripeAccountId);
  res.json({
    connected: true,
    charges_enabled: acct.charges_enabled,
    payouts_enabled: acct.payouts_enabled,
    requirements: acct.requirements,
  });
});

// ---------------------------------------------------------------------------
// Cobro de tiendas / veterinarios: reciben de la plataforma el € de los canjes
// de Patitas. Misma cuenta Express conectada, perfil de empresa.
// ---------------------------------------------------------------------------

// Crea/recupera la cuenta Express del partner y devuelve el enlace de onboarding.
r.post('/connect/partner/link', async (req, res) => {
  const partnerId = (req as any).user?._id || (req as any).user?.id;
  if (!partnerId) return res.status(401).json({ error: 'unauthorized' });

  const partner = await User.findById(partnerId);
  if (!partner) return res.status(404).json({ error: 'partner_not_found' });
  if (!['store', 'vet', 'admin'].includes(String(partner.role))) {
    return res.status(403).json({ error: 'only_partners' });
  }
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'payments_unavailable' });
  }

  const stripe = getStripeClient();
  if (!partner.stripeAccountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'ES',
      email: partner.email,
      business_type: 'company',
      capabilities: { transfers: { requested: true } },
      business_profile: {
        product_description: partner.role === 'vet'
          ? 'Servicios veterinarios canjeables con Patitas'
          : 'Tienda de productos para mascotas canjeables con Patitas',
      },
    });
    partner.stripeAccountId = account.id;
    await partner.save();
  }

  const base = frontendBase();
  const link = await stripe.accountLinks.create({
    account: partner.stripeAccountId!,
    refresh_url: `${base}/profile?connect=refresh`,
    return_url: `${base}/profile?connect=return`,
    type: 'account_onboarding',
  });

  res.json({ accountId: partner.stripeAccountId, url: link.url });
});

// Estado de la cuenta de cobro del partner.
r.get('/connect/partner/status', async (req, res) => {
  const partnerId = (req as any).user?._id || (req as any).user?.id;
  if (!partnerId) return res.status(401).json({ error: 'unauthorized' });

  const partner = await User.findById(partnerId).lean();
  if (!partner?.stripeAccountId) return res.json({ connected: false, charges_enabled: false, payouts_enabled: false });

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'payments_unavailable' });
  }
  const stripe = getStripeClient();
  const acct = await stripe.accounts.retrieve(partner.stripeAccountId);
  res.json({
    connected: true,
    charges_enabled: acct.charges_enabled,
    payouts_enabled: acct.payouts_enabled,
    requirements: acct.requirements,
  });
});

export default r;
