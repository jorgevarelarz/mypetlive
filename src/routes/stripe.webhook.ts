import express, { Router } from 'express';
import { Types } from 'mongoose';
import { getStripeClient, isStripeConfigured } from '../utils/stripe';
import { Contract } from '../models/contract.model';
import Stripe from 'stripe';
import ServiceOffer from '../models/serviceOffer.model';
import Appointment from '../models/appointment.model';
import Conversation from '../models/conversation.model';
import Message from '../models/message.model';
import PlatformEarning from '../models/platformEarning.model';
import ProcessedEvent from '../models/processedEvent.model';
import { calcServiceFee } from '../utils/calcServiceFee';
import { recordContractHistory } from '../utils/history';
import logger from '../utils/logger';

const r = Router();

async function publishSystem(conversationId: string, systemCode: string, payload?: any) {
  await Message.create({ conversationId, senderId: 'system', type: 'system', systemCode, payload, readBy: [] });
  await Conversation.findByIdAndUpdate(conversationId, { lastMessageAt: new Date() });
}

async function ensureContractConversation(contractId: string): Promise<string> {
  let conv = await Conversation.findOne({ kind: 'contract', refId: contractId });
  if (conv) return conv.id;
  const c = await Contract.findById(contractId).lean();
  if (!c) throw new Error('Contract not found');
  conv = await Conversation.create({ kind: 'contract', refId: contractId, participants: [String(c.landlord), String(c.tenant)], meta: { contractId, ownerId: String(c.landlord), tenantId: String(c.tenant) }, unread: {} });
  return conv.id;
}

r.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  // In producción el secreto es obligatorio
  if (process.env.NODE_ENV === 'production' && !secret) {
    return res.status(500).json({ error: 'stripe_webhook_secret_missing' });
  }
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'stripe_not_configured' });
  }
  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Idempotency: ensure each Stripe event is processed once (atomic upsert)
  try {
    const metadata = (event.data.object as any)?.metadata || {};
    const rawContractId = typeof metadata.contractId === 'string' ? metadata.contractId : undefined;
    const contractIdForEvent =
      rawContractId && Types.ObjectId.isValid(rawContractId)
        ? new Types.ObjectId(rawContractId)
        : new Types.ObjectId();
    const r = await ProcessedEvent.updateOne(
      { provider: 'stripe', eventId: event.id },
      {
        $setOnInsert: {
          provider: 'stripe',
          eventId: event.id,
          contractId: contractIdForEvent,
          receivedAt: new Date(),
        },
      },
      { upsert: true },
    );
    // If the document already existed, treat as duplicate and ack
    if ((r as any).upsertedCount === 0 && (r as any).matchedCount > 0) {
      return res.json({ received: true, duplicate: true });
    }
  } catch (err: any) {
    // For DB errors, surface 500 to allow Stripe to retry later
    logger.error({ err, eventId: event.id }, 'Error almacenando idempotencia de Stripe');
    return res.status(500).json({ error: 'idempotency_store_failed' });
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object as Stripe.PaymentIntent;
      const contractId = intent.metadata?.contractId as string | undefined;
      const offerId = intent.metadata?.offerId as string | undefined;
      if (contractId) {
        await Contract.findByIdAndUpdate(contractId, { lastPaidAt: new Date(), paymentRef: intent.id });
      }
      if (offerId) {
        const offer = await ServiceOffer.findById(offerId);
        if (offer) {
          const fee = calcServiceFee(offer.amount);
          offer.status = 'confirmed';
          await offer.save();
          if (offer.appointmentId) {
            await Appointment.findByIdAndUpdate(offer.appointmentId, { status: 'confirmed' });
          }
          const conv = await Conversation.findById(offer.conversationId);
          if (conv) {
            await publishSystem(conv.id, 'PAYMENT_SUCCEEDED', { offerId });
            if (conv.meta?.contractId) {
              const contractConvId = await ensureContractConversation(conv.meta.contractId);
              await publishSystem(contractConvId, 'APPOINTMENT_CONFIRMED', { offerId });
            }
          }
          if (offer.appointmentId) {
            const appointment = await Appointment.findById(offer.appointmentId).lean();
            if (appointment) {
              let aConv = await Conversation.findOne({ kind: 'appointment', refId: offer.appointmentId });
              if (!aConv) {
                aConv = await Conversation.create({ kind: 'appointment', refId: offer.appointmentId, participants: [appointment.proId, appointment.tenantId], meta: { appointmentId: offer.appointmentId, proUserId: appointment.proId, tenantId: appointment.tenantId, ownerId: appointment.ownerId, ticketId: appointment.ticketId }, unread: {} });
              }
              await publishSystem(aConv.id, 'APPOINTMENT_CONFIRMED', { offerId });
            }
          }
          await PlatformEarning.create({ kind: 'service', offerId, proId: offer.proId, serviceKey: offer.serviceKey, gross: fee.gross, fee: fee.fee, netToPro: fee.netToPro, currency: offer.currency, paymentRef: intent.id });
        }
      }
      break;
    }
    case 'payment_intent.payment_failed': {
      const intent = event.data.object as Stripe.PaymentIntent;
      const offerId = intent.metadata?.offerId as string | undefined;
      if (offerId) {
        const offer = await ServiceOffer.findById(offerId);
        if (offer) {
          await publishSystem(offer.conversationId, 'PAYMENT_FAILED', { offerId });
        }
      }
      break;
    }
    case 'payment_intent.processing': {
      const intent = event.data.object as Stripe.PaymentIntent;
      const offerId = intent.metadata?.offerId as string | undefined;
      if (offerId) {
        const offer = await ServiceOffer.findById(offerId);
        if (offer) {
          await publishSystem(offer.conversationId, 'PAYMENT_PROCESSING', { offerId });
        }
      }
      break;
    }
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.donation === 'true') {
        const amount = session.amount_total || 0;
        const paymentRef = session.payment_intent as string | undefined;
        const { Donation } = await import('../models/donation.model');
        await Donation.findOneAndUpdate(
          { sessionId: session.id },
          { status: 'completed', paymentRef, amount, currency: session.currency?.toLowerCase() || 'eur' },
          { new: true }
        );
      } else if (session.metadata?.deposit === 'true') {
        const contractId = session.metadata?.contractId;
        if (contractId) {
          const contract = await Contract.findById(contractId);
          if (contract && !contract.depositPaid) {
            contract.depositPaid = true;
            contract.depositPaidAt = new Date();
            await contract.save();
            await recordContractHistory(contract.id, 'depositPaid', 'Fianza pagada a través de la plataforma');
          }
        }
      }
      break;
    }
    case 'charge.refunded': {
      // handle refund record logic
      break;
    }
  }

  res.json({ received: true });
});

export default r;
