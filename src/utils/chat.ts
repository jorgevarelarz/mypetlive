import Conversation, { type ConversationKind, type IConversation } from '../models/conversation.model';
import Message from '../models/message.model';
import { Adoption } from '../models/adoption.model';
import { Animal } from '../models/animal.model';
import { VetAppointment } from '../models/vetAppointment.model';
import { User } from '../models/user.model';
import logger from './logger';

// Conversaciones del chat: quién habla con quién sobre qué, y los avisos que
// el sistema deja dentro (cambios de estado, visitas, citas) para que la
// conversación cuente la historia entera sin tener que ir a otra pantalla.

export class ChatError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type Resolved = { participants: string[]; meta: Record<string, string> };

/** Las dos personas de la conversación y los ids que la atan a su origen. */
async function resolve(kind: string, refId: string): Promise<Resolved> {
  if (kind === 'adoption') {
    const adoption = await Adoption.findById(refId).lean();
    if (!adoption) throw new ChatError('Adoption not found', 404);
    const animal = await Animal.findById(adoption.animalId).select('shelter').lean();
    if (!animal?.shelter) throw new ChatError('Animal not found', 404);
    const shelterId = String(animal.shelter);
    const adopterId = String(adoption.adopterId);
    return {
      participants: [adopterId, shelterId],
      meta: { adoptionId: refId, animalId: String(adoption.animalId), shelterId, adopterId },
    };
  }
  if (kind === 'vet_appointment') {
    const appt: any = await VetAppointment.findById(refId).select('vetId userId').lean();
    if (!appt) throw new ChatError('Appointment not found', 404);
    const vetId = String(appt.vetId);
    const ownerId = String(appt.userId);
    return { participants: [ownerId, vetId], meta: { appointmentId: refId, vetId, ownerId } };
  }
  throw new ChatError('Invalid kind', 400);
}

/**
 * Devuelve la conversación de esa solicitud o cita, creándola si hace falta.
 * Con `userId`, exige que sea una de las dos partes (las rutas); sin él es una
 * llamada interna del servidor (avisos de estado).
 */
export async function ensureConversation(kind: string, refId: string, userId?: string) {
  if (!refId || !/^[a-f0-9]{24}$/i.test(String(refId))) throw new ChatError('Invalid refId', 400);
  let conv = await Conversation.findOne({ kind, refId });
  if (!conv) {
    const { participants, meta } = await resolve(kind, String(refId));
    if (userId && !participants.includes(userId)) throw new ChatError('Forbidden', 403);
    try {
      conv = await Conversation.create({ kind, refId, participants, meta, unread: {} });
    } catch (err: any) {
      // Dos peticiones a la vez: la otra ganó el índice único.
      if (err?.code !== 11000) throw err;
      conv = await Conversation.findOne({ kind, refId });
    }
  }
  if (!conv) throw new ChatError('Conversation not found', 404);
  if (userId && !conv.participants.includes(userId)) throw new ChatError('Forbidden', 403);
  return conv;
}

/**
 * Deja un aviso del sistema en la conversación (tarjeta en el chat). Cuenta
 * como no leído para la otra parte, no para quien lo provocó. No manda correo
 * de «mensaje sin leer»: cada cambio de estado ya tiene su propio aviso.
 *
 * Nunca lanza: el cambio de estado ya está guardado y el chat es secundario.
 */
export async function postSystemMessage(opts: {
  kind: ConversationKind;
  refId: string;
  code: string;
  body: string;
  payload?: Record<string, unknown>;
  actorId?: string;
}) {
  try {
    const conv = await ensureConversation(opts.kind, String(opts.refId));
    await Message.create({
      conversationId: String(conv._id),
      senderId: opts.actorId || 'system',
      type: 'system',
      systemCode: opts.code,
      body: opts.body,
      payload: opts.payload,
      readBy: opts.actorId ? [opts.actorId] : [],
    });
    conv.lastMessageAt = new Date();
    conv.unread = conv.unread || {};
    for (const p of conv.participants) {
      if (p !== opts.actorId) conv.unread[p] = (conv.unread[p] || 0) + 1;
    }
    conv.markModified('unread');
    await conv.save();
  } catch (err) {
    logger.error({ err, kind: opts.kind, refId: opts.refId, code: opts.code }, '[chat] no se pudo dejar el aviso');
  }
}

/** «sábado, 1 de noviembre, 11:00» en hora de España (el servidor va en UTC). */
export function formatWhen(d: Date | string): string {
  return new Date(d).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

/** Nombre que se enseña de una cuenta: la entidad para protectoras y clínicas. */
export function displayName(u: any): string {
  if (!u) return 'Usuario';
  if (u.deletedAt) return 'Usuario eliminado';
  if (['landlord', 'vet', 'store'].includes(u.role)) return u.profile?.orgName || u.name || 'MyPetLive';
  return u.name || 'Usuario';
}

const firstPhoto = (a: any): string | undefined => (Array.isArray(a?.images) && a.images[0]) || undefined;

/**
 * Datos para pintar la bandeja y la cabecera de cada conversación: con quién,
 * sobre qué animal, en qué estado está la solicitud o la cita y el último
 * mensaje. Todo en lotes, sin una consulta por conversación.
 */
export async function summarize(convs: IConversation[] | any[], userId: string) {
  if (!convs.length) return [];
  const others = convs.map(c => c.participants.find((p: string) => p !== userId) || c.participants[0]);
  const adoptionIds = convs.filter(c => c.kind === 'adoption').map(c => c.refId);
  const apptIds = convs.filter(c => c.kind === 'vet_appointment').map(c => c.refId);

  const [users, adoptions, appts, lastMsgs] = await Promise.all([
    User.find({ _id: { $in: others } }).select('name role profile.orgName profile.avatarUrl deletedAt').lean(),
    Adoption.find({ _id: { $in: adoptionIds } }).select('animalId status visit').lean(),
    VetAppointment.find({ _id: { $in: apptIds } })
      .select('animalId animalCode status requestedAt scheduledAt service reason').lean(),
    Message.aggregate([
      { $match: { conversationId: { $in: convs.map(c => String(c._id)) } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$conversationId', doc: { $first: '$$ROOT' } } },
    ]),
  ]);
  const animalIds = [
    ...adoptions.map((a: any) => a.animalId),
    ...appts.map((a: any) => a.animalId).filter(Boolean),
  ];
  const codes = appts.filter((a: any) => !a.animalId && a.animalCode).map((a: any) => a.animalCode);
  const animals = await Animal.find({ $or: [{ _id: { $in: animalIds } }, { code: { $in: codes } }] })
    .select('name images species code').lean();

  const userMap = new Map(users.map((u: any) => [String(u._id), u]));
  const adoptionMap = new Map(adoptions.map((a: any) => [String(a._id), a]));
  const apptMap = new Map(appts.map((a: any) => [String(a._id), a]));
  const lastMap = new Map(lastMsgs.map((m: any) => [String(m._id), m.doc]));
  const animalById = new Map(animals.map((a: any) => [String(a._id), a]));
  const animalByCode = new Map(animals.map((a: any) => [a.code, a]));

  return convs.map((c: any, i) => {
    const other = userMap.get(String(others[i]));
    const last: any = lastMap.get(String(c._id));
    let animal: any;
    let context: Record<string, unknown> = {};
    if (c.kind === 'adoption') {
      const ad: any = adoptionMap.get(String(c.refId));
      animal = ad ? animalById.get(String(ad.animalId)) : undefined;
      context = {
        type: 'adoption',
        adoptionId: String(c.refId),
        status: ad?.status,
        visit: ad?.visit || null,
        // Quién mira: la protectora ve «quiere adoptar a», el adoptante «solicitud por».
        role: c.meta?.shelterId === userId ? 'shelter' : 'adopter',
      };
    } else {
      const ap: any = apptMap.get(String(c.refId));
      animal = ap ? (ap.animalId ? animalById.get(String(ap.animalId)) : animalByCode.get(ap.animalCode)) : undefined;
      context = {
        type: 'vet_appointment',
        appointmentId: String(c.refId),
        status: ap?.status,
        at: ap ? ap.scheduledAt || ap.requestedAt : undefined,
        service: ap?.service?.name || undefined,
        reason: ap?.reason,
        role: c.meta?.vetId === userId ? 'vet' : 'owner',
      };
    }
    return {
      _id: String(c._id),
      kind: c.kind,
      refId: c.refId,
      lastMessageAt: c.lastMessageAt || c.createdAt,
      unreadForMe: c.unread?.[userId] || 0,
      other: {
        id: String(others[i]),
        name: displayName(other),
        role: other?.role,
        avatarUrl: other?.profile?.avatarUrl,
      },
      animal: animal ? { id: String(animal._id), name: animal.name, photo: firstPhoto(animal), species: animal.species } : null,
      context,
      lastMessage: last
        ? {
            type: last.type,
            body: last.body,
            systemCode: last.systemCode,
            mine: last.senderId === userId,
            hasAttachment: Boolean(last.attachmentUrl),
            createdAt: last.createdAt,
          }
        : null,
    };
  });
}
