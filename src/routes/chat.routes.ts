import { Router } from 'express';
import Conversation from '../models/conversation.model';
import Message from '../models/message.model';
import { Contract } from '../models/contract.model';
import Ticket from '../models/ticket.model';
import Appointment from '../models/appointment.model';
import { Application } from '../models/application.model';
import { Property } from '../models/property.model';
import { Adoption } from '../models/adoption.model';
import { Animal } from '../models/animal.model';
import { getUserId } from '../utils/getUserId';
import { User } from '../models/user.model';
import { sendPushToUser } from '../utils/push';

const r = Router();

function parsePagination(query: any) {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit as string) || 20));
  return { page, limit };
}

async function ensureConversation(kind: string, refId: string, userId: string) {
  let conv = await Conversation.findOne({ kind, refId });
  if (conv) {
    // Una conversación existente también exige ser participante: sin esto,
    // cualquier usuario autenticado obtenía sus metadatos (y el id para intentar más).
    if (!conv.participants.includes(userId)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    return conv;
  }

  let participants: string[] = [];
  let meta: any = {};
  if (kind === 'contract') {
    const c = await Contract.findById(refId).lean();
    if (!c) throw Object.assign(new Error('Contract not found'), { status: 404 });
    if (![String(c.landlord), String(c.tenant)].includes(userId)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    participants = [String(c.landlord), String(c.tenant)];
    meta.contractId = refId;
    meta.ownerId = String(c.landlord);
    meta.tenantId = String(c.tenant);
  } else if (kind === 'ticket') {
    const t = await Ticket.findById(refId).lean();
    if (!t) throw Object.assign(new Error('Ticket not found'), { status: 404 });
    if (![t.ownerId, t.proId].includes(userId)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    participants = [t.ownerId, t.proId!];
    meta.ticketId = refId;
    meta.ownerId = t.ownerId;
    meta.proUserId = t.proId;
    meta.contractId = t.contractId;
    meta.tenantId = t.openedBy;
    if (t.propertyId) meta.propertyId = t.propertyId;
  } else if (kind === 'appointment') {
    const a = await Appointment.findById(refId).lean();
    if (!a) throw Object.assign(new Error('Appointment not found'), { status: 404 });
    if (![a.proId, a.tenantId].includes(userId)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    participants = [a.proId, a.tenantId];
    meta.appointmentId = refId;
    meta.proUserId = a.proId;
    meta.tenantId = a.tenantId;
    meta.ownerId = a.ownerId;
    meta.ticketId = a.ticketId;
  } else if (kind === 'application') {
    const app = await Application.findById(refId).lean();
    if (!app) throw Object.assign(new Error('Application not found'), { status: 404 });
    const property = await Property.findById(app.propertyId).lean();
    if (!property) throw Object.assign(new Error('Property not found'), { status: 404 });
    const ownerId = String(property.owner);
    if (![ownerId, app.tenantId].includes(userId)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    participants = [ownerId, app.tenantId];
    meta.applicationId = refId;
    meta.ownerId = ownerId;
    meta.tenantId = app.tenantId;
    meta.propertyId = app.propertyId;
  } else if (kind === 'adoption') {
    // Chat adoptante ↔ protectora sobre una solicitud de adopción concreta.
    const adoption = await Adoption.findById(refId).lean();
    if (!adoption) throw Object.assign(new Error('Adoption not found'), { status: 404 });
    const animal = await Animal.findById(adoption.animalId).select('shelter').lean();
    if (!animal?.shelter) throw Object.assign(new Error('Animal not found'), { status: 404 });
    const shelterId = String(animal.shelter);
    const adopterId = String(adoption.adopterId);
    if (![shelterId, adopterId].includes(userId)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    participants = [adopterId, shelterId];
    meta.adoptionId = refId;
    meta.animalId = String(adoption.animalId);
    meta.shelterId = shelterId;
    meta.adopterId = adopterId;
  } else {
    throw Object.assign(new Error('Invalid kind'), { status: 400 });
  }

  conv = await Conversation.create({ kind, refId, participants, meta, unread: {} });
  return conv;
}

// Rate limiting messages per conversation: 20 por minuto
const messageTimestamps = new Map<string, number[]>();
// Rate limiting mensajes por usuario (global): 60 por minuto
const userTimestamps = new Map<string, number[]>();

r.get('/conversations', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { page, limit } = parsePagination(req.query);
    const list = await Conversation.find({ participants: userId })
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    // Enriquecer con mini perfil público de participantes (isPro/proLimit)
    const ids = Array.from(new Set(list.flatMap(c => c.participants.map(p => String(p)))));
    const users = await User.find({ _id: { $in: ids } })
      .select('name tenantPro.status tenantPro.maxRent')
      .lean();
    const umap = new Map(users.map((u: any) => [String(u._id), u]));
    const result = list.map(c => ({
      ...c,
      unreadForMe: c.unread?.[userId] || 0,
      participantsInfo: c.participants.map((pid: any) => {
        const u: any = umap.get(String(pid));
        const isPro = u?.tenantPro?.status === 'verified';
        const proLimit = typeof u?.tenantPro?.maxRent === 'number' && u.tenantPro.maxRent > 0 ? u.tenantPro.maxRent : undefined;
        return { id: String(pid), name: u?.name, isPro, proLimit };
      }),
    }));
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

r.post('/conversations/ensure', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { kind, refId } = req.body || {};
    const conv = await ensureConversation(kind, refId, userId);
    const ids = conv.participants.map(p => String(p));
    const users = await User.find({ _id: { $in: ids } })
      .select('name tenantPro.status tenantPro.maxRent')
      .lean();
    const umap = new Map(users.map((u: any) => [String(u._id), u]));
    const participantsInfo = conv.participants.map((pid: any) => {
      const u: any = umap.get(String(pid));
      const isPro = u?.tenantPro?.status === 'verified';
      const proLimit = typeof u?.tenantPro?.maxRent === 'number' && u.tenantPro.maxRent > 0 ? u.tenantPro.maxRent : undefined;
      return { id: String(pid), name: u?.name, isPro, proLimit };
    });
    res.json({ ...(conv.toObject ? conv.toObject() : conv), participantsInfo });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

r.post('/:conversationId/messages', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { conversationId } = req.params;
    const conv = await Conversation.findById(conversationId);
    if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
    if (!conv.participants.includes(userId)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    // rate limit
    const now = Date.now();
    const convStamps = messageTimestamps.get(conversationId) || [];
    const convRecent = convStamps.filter(ts => now - ts < 60 * 1000);
    if (convRecent.length >= 20) {
      throw Object.assign(new Error('Rate limit'), { status: 429 });
    }
    convRecent.push(now);
    messageTimestamps.set(conversationId, convRecent);

    const userStamps = userTimestamps.get(userId) || [];
    const userRecent = userStamps.filter(ts => now - ts < 60 * 1000);
    if (userRecent.length >= 60) {
      throw Object.assign(new Error('Rate limit (user)'), { status: 429 });
    }
    userRecent.push(now);
    userTimestamps.set(userId, userRecent);

    const { body, attachmentUrl } = req.body || {};
    // Sanitizar: cuerpo máximo 2k, attachmentUrl solo dominios permitidos
    const text = typeof body === 'string' ? String(body).slice(0, 2000) : undefined;
    let url: string | undefined = typeof attachmentUrl === 'string' ? String(attachmentUrl) : undefined;
    if (url) {
      const allow = (process.env.UPLOADS_BASE_URL || '').split(',').map(s=>s.trim()).filter(Boolean);
      const ok = allow.length === 0
        ? /^https?:\/\//i.test(url) || url.startsWith('/uploads/')
        : allow.some(prefix => url.startsWith(prefix));
      if (!ok) {
        return res.status(400).json({ error: 'attachment_domain_not_allowed' });
      }
    }
    const msg = await Message.create({ conversationId, senderId: userId, type: 'user', body: text, attachmentUrl: url, readBy: [userId] });
    conv.lastMessageAt = new Date();
    conv.participants.forEach(p => {
      conv.unread = conv.unread || {};
      if (p !== userId) {
        conv.unread[p] = (conv.unread[p] || 0) + 1;
      }
    });
    conv.markModified('unread');
    await conv.save();

    // Push al resto de participantes; en segundo plano, sin bloquear la respuesta.
    const sender = await User.findById(userId).select('name').lean();
    conv.participants
      .filter(p => p !== userId)
      .forEach(p => {
        void sendPushToUser(p, {
          title: sender?.name ? `Mensaje de ${sender.name}` : 'Nuevo mensaje',
          body: text ? text.slice(0, 120) : 'Te han enviado un adjunto',
          url: '/chat',
        });
      });

    res.status(201).json(msg);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

r.get('/:conversationId/messages', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { conversationId } = req.params;
    const { before, limit = 20 } = req.query as any;
    const conv = await Conversation.findById(conversationId);
    if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
    if (!conv.participants.includes(userId)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    const q: any = { conversationId };
    if (before) q.createdAt = { $lt: new Date(before) };
    const msgs = await Message.find(q).sort({ createdAt: -1 }).limit(Number(limit)).lean();
    res.json(msgs);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

r.post('/:conversationId/read', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { conversationId } = req.params;
    const conv = await Conversation.findById(conversationId);
    if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
    if (!conv.participants.includes(userId)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    // `unread` es Mixed: la mutación anidada no se detecta sin markModified,
    // así que el contador nunca se reseteaba en BD.
    conv.unread = { ...(conv.unread || {}), [userId]: 0 };
    conv.markModified('unread');
    await conv.save();
    await Message.updateMany({ conversationId, readBy: { $ne: userId } }, { $addToSet: { readBy: userId } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default r;
