import { Router } from 'express';
import Conversation from '../models/conversation.model';
import Message from '../models/message.model';
import { getUserId } from '../utils/getUserId';
import { User } from '../models/user.model';
import { ChatError, displayName, ensureConversation, summarize } from '../utils/chat';
import { sendPushToUser } from '../utils/push';

// Ruta /uploads/<fichero> propia: relativa, o absoluta con el origen de esta API
// (APP_URL/FRONTEND_URL o el host de la petición, que es lo que devuelve /api/uploads).
function isOwnUploadUrl(url: string, req: any): boolean {
  const file = /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
  if (url.startsWith('/')) return file.test(url) && !url.includes('..');
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.search || parsed.hash) return false;
  const origins = [process.env.APP_URL, process.env.FRONTEND_URL, `${req.protocol}://${req.get('host')}`]
    .filter(Boolean)
    .map(o => { try { return new URL(String(o)).origin; } catch { return ''; } });
  return origins.includes(parsed.origin) && file.test(parsed.pathname) && !parsed.pathname.includes('..');
}

const r = Router();

function parsePagination(query: any) {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit as string) || 20));
  return { page, limit };
}

function fail(res: any, err: any) {
  const status = err instanceof ChatError ? err.status : err?.status || 500;
  res.status(status).json({ error: status === 500 ? 'internal_error' : err.message });
}

/** Conversación por id, solo para sus dos participantes. */
async function loadOwn(conversationId: string, userId: string) {
  if (!/^[a-f0-9]{24}$/i.test(String(conversationId))) throw new ChatError('Conversation not found', 404);
  const conv = await Conversation.findById(conversationId);
  if (!conv) throw new ChatError('Conversation not found', 404);
  if (!conv.participants.includes(userId)) throw new ChatError('Forbidden', 403);
  return conv;
}

// Rate limiting messages per conversation: 20 por minuto
const messageTimestamps = new Map<string, number[]>();
// Rate limiting mensajes por usuario (global): 60 por minuto
const userTimestamps = new Map<string, number[]>();

// Bandeja: conversaciones con quién, sobre qué animal, estado y último mensaje.
r.get('/conversations', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { page, limit } = parsePagination(req.query);
    const list = await Conversation.find({ participants: userId })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json(await summarize(list, userId));
  } catch (err: any) {
    fail(res, err);
  }
});

// Total de no leídos, para el número del menú. Barato: se consulta a menudo.
r.get('/unread-count', async (req, res) => {
  try {
    const userId = getUserId(req);
    const list = await Conversation.find({ participants: userId, [`unread.${userId}`]: { $gt: 0 } })
      .select('unread').lean();
    const total = list.reduce((acc, c: any) => acc + (c.unread?.[userId] || 0), 0);
    res.json({ total, conversations: list.length });
  } catch (err: any) {
    fail(res, err);
  }
});

// Preferencia de correo por mensaje sin leer.
r.get('/prefs', async (req, res) => {
  try {
    const u: any = await User.findById(getUserId(req)).select('chatEmailOff').lean();
    res.json({ emailUnread: !u?.chatEmailOff });
  } catch (err: any) {
    fail(res, err);
  }
});

r.put('/prefs', async (req, res) => {
  try {
    const emailUnread = req.body?.emailUnread;
    if (typeof emailUnread !== 'boolean') return res.status(400).json({ error: 'emailUnread_required' });
    await User.updateOne({ _id: getUserId(req) }, { chatEmailOff: !emailUnread });
    res.json({ emailUnread });
  } catch (err: any) {
    fail(res, err);
  }
});

r.post('/conversations/ensure', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { kind, refId } = req.body || {};
    const conv = await ensureConversation(String(kind || ''), String(refId || ''), userId);
    const [summary] = await summarize([conv.toObject()], userId);
    res.json(summary);
  } catch (err: any) {
    fail(res, err);
  }
});

r.get('/conversations/:conversationId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const conv = await loadOwn(req.params.conversationId, userId);
    const [summary] = await summarize([conv.toObject()], userId);
    res.json(summary);
  } catch (err: any) {
    fail(res, err);
  }
});

r.post('/:conversationId/messages', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { conversationId } = req.params;
    const conv = await loadOwn(conversationId, userId);
    // rate limit
    const now = Date.now();
    const convStamps = messageTimestamps.get(conversationId) || [];
    const convRecent = convStamps.filter(ts => now - ts < 60 * 1000);
    if (convRecent.length >= 20) {
      throw new ChatError('Rate limit', 429);
    }
    convRecent.push(now);
    messageTimestamps.set(conversationId, convRecent);

    const userStamps = userTimestamps.get(userId) || [];
    const userRecent = userStamps.filter(ts => now - ts < 60 * 1000);
    if (userRecent.length >= 60) {
      throw new ChatError('Rate limit (user)', 429);
    }
    userRecent.push(now);
    userTimestamps.set(userId, userRecent);

    const { body, attachmentUrl } = req.body || {};
    // Sanitizar: cuerpo máximo 2k, attachmentUrl solo dominios permitidos
    const text = typeof body === 'string' && body.trim() ? String(body).trim().slice(0, 2000) : undefined;
    let url: string | undefined = typeof attachmentUrl === 'string' && attachmentUrl ? String(attachmentUrl) : undefined;
    if (url) {
      // Solo ficheros subidos a nuestro /uploads (RentalApp fd6351f). Antes, sin
      // UPLOADS_BASE_URL (producción), valía cualquier URL http: enlaces de phishing
      // o píxeles de rastreo dentro del chat de adopción.
      if (!isOwnUploadUrl(url, req)) {
        return res.status(400).json({ error: 'attachment_domain_not_allowed' });
      }
    }
    if (!text && !url) return res.status(400).json({ error: 'empty_message' });
    const msg = await Message.create({ conversationId, senderId: userId, type: 'user', body: text, attachmentUrl: url, readBy: [userId] });
    conv.lastMessageAt = new Date();
    conv.unread = conv.unread || {};
    conv.pendingEmail = conv.pendingEmail || [];
    for (const p of conv.participants) {
      if (p === userId) continue;
      conv.unread[p] = (conv.unread[p] || 0) + 1;
      // Se apunta desde el PRIMER mensaje sin leer: el correo sale a los 10
      // minutos de ese, no del último, y solo uno hasta que lo lea.
      if (!conv.pendingEmail.some(e => e.userId === p)) {
        conv.pendingEmail.push({ userId: p, since: new Date(), emailed: false });
      }
    }
    conv.markModified('unread');
    conv.markModified('pendingEmail');
    await conv.save();

    // Push al resto de participantes; en segundo plano, sin bloquear la respuesta.
    const sender = await User.findById(userId).select('name role profile.orgName').lean();
    const [summary] = await summarize([conv.toObject()], userId);
    const about = summary?.animal?.name ? ` · ${summary.animal.name}` : '';
    conv.participants
      .filter(p => p !== userId)
      .forEach(p => {
        void sendPushToUser(p, {
          title: `${displayName(sender)}${about}`,
          body: text ? text.slice(0, 120) : '📷 Te ha enviado una foto',
          url: `/mensajes/${conversationId}`,
        });
      });

    res.status(201).json(msg);
  } catch (err: any) {
    fail(res, err);
  }
});

r.get('/:conversationId/messages', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { conversationId } = req.params;
    await loadOwn(conversationId, userId);
    const { before, after } = req.query as any;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const q: any = { conversationId };
    // `after` es lo que pide la conversación abierta cada pocos segundos: solo lo nuevo.
    if (after) q.createdAt = { $gt: new Date(after) };
    else if (before) q.createdAt = { $lt: new Date(before) };
    const msgs = await Message.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(msgs);
  } catch (err: any) {
    fail(res, err);
  }
});

// Hasta dónde ha leído la otra persona: para el «Visto» de mis mensajes.
r.get('/:conversationId/seen', async (req, res) => {
  try {
    const userId = getUserId(req);
    const conv = await loadOwn(req.params.conversationId, userId);
    const other = conv.participants.find(p => p !== userId);
    const lastSeen = other
      ? await Message.findOne({ conversationId: String(conv._id), senderId: userId, readBy: other })
        .sort({ createdAt: -1 }).select('createdAt').lean()
      : null;
    res.json({ seenUntil: (lastSeen as any)?.createdAt || null });
  } catch (err: any) {
    fail(res, err);
  }
});

r.post('/:conversationId/read', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { conversationId } = req.params;
    const conv = await loadOwn(conversationId, userId);
    // `unread` es Mixed: la mutación anidada no se detecta sin markModified,
    // así que el contador nunca se reseteaba en BD.
    conv.unread = { ...(conv.unread || {}), [userId]: 0 };
    conv.markModified('unread');
    conv.pendingEmail = (conv.pendingEmail || []).filter(e => e.userId !== userId);
    conv.markModified('pendingEmail');
    await conv.save();
    await Message.updateMany({ conversationId, readBy: { $ne: userId } }, { $addToSet: { readBy: userId } });
    res.json({ ok: true });
  } catch (err: any) {
    fail(res, err);
  }
});

export default r;
