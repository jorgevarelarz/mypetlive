import crypto from 'crypto';
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Animal } from '../models/animal.model';
import { PetInvite, PET_INVITE_DAYS } from '../models/petInvite.model';
import { User } from '../models/user.model';
import { sendEmail } from '../utils/notification';
import { brandedEmail } from '../utils/emailTemplates';
import { escapeHtml } from '../utils/escapeHtml';
import { sendPushToUser } from '../utils/push';
import { canManageAnimal, familyMemberIds, familyOwnerId, isFamilyPet, isPrimaryOwner } from '../utils/animalAccess';
import logger from '../utils/logger';

// Mascota compartida. Una mascota de familia tiene UN dueño (`ownerId`) y puede
// tener más personas que la cuidan (`members`): la pareja, los hijos, quien la
// saca cuando no estás. Entran por invitación del dueño y, una vez dentro, la
// llevan igual que él (ver `canManageAnimal`); invitar, quitar gente y
// despedirla en el mural sigue siendo cosa del dueño (`isPrimaryOwner`).

/** Personas con acceso además del dueño, contando las invitaciones pendientes. */
export const MAX_PET_MEMBERS = 5;

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FRONTEND_URL = () => process.env.FRONTEND_URL || 'https://mypetlive.es';
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const uidOf = (req: Request) => {
  const u: any = (req as any).user;
  return String(u?._id || u?.id || '');
};
const firstName = (u: any) => String(u?.profile?.firstName || u?.name || '').trim().split(/\s+/)[0] || 'Alguien';

/** «ana@gmail.com» → «a••@gmail.com»: lo justo para que sepa a qué correo fue. */
function maskEmail(email: string) {
  const [user, domain] = String(email).split('@');
  if (!domain) return '';
  return `${user.slice(0, 1)}${'•'.repeat(Math.min(3, Math.max(1, user.length - 1)))}@${domain}`;
}

async function loadFamilyPet(req: Request, res: Response) {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  const animal: any = await Animal.findById(id);
  // Solo las mascotas de familia se comparten: un animal de protectora ya lo
  // gestiona su equipo con su propia cuenta.
  if (!animal || !isFamilyPet(animal)) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  if (!canManageAnimal((req as any).user, animal)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return animal;
}

// GET /api/animals/:id/family — quién cuida de la mascota. Lo ven el dueño y
// los miembros; las invitaciones pendientes, solo el dueño.
export async function getFamily(req: Request, res: Response) {
  const animal = await loadFamilyPet(req, res);
  if (!animal) return;
  const me = uidOf(req);
  const owner = String(familyOwnerId(animal) || '');
  const memberIds = familyMemberIds(animal);
  const people: any[] = await User.find({ _id: { $in: [owner, ...memberIds].filter(Boolean) } })
    .select('name email profile.firstName')
    .lean();
  const byId = new Map(people.map(p => [String(p._id), p]));
  const amOwner = isPrimaryOwner((req as any).user, animal);
  // Los correos solo los ve el dueño (AUD-2): un miembro puede ser quien recibió
  // un enlace reenviado, con cualquier cuenta.
  const person = (id: string) => {
    const p = byId.get(id);
    return { userId: id, name: p?.name || 'Usuario', email: amOwner || id === me ? p?.email || undefined : undefined, isMe: id === me };
  };

  const invites = amOwner
    ? await PetInvite.find({ animalId: animal._id, status: 'pending', expiresAt: { $gt: new Date() } })
      .select('email createdAt expiresAt')
      .sort({ createdAt: -1 })
      .lean()
    : [];

  res.json({
    me: amOwner ? 'owner' : 'member',
    owner: owner ? person(owner) : null,
    members: (animal.members || []).map((m: any) => ({ ...person(String(m.userId)), addedAt: m.addedAt })),
    invites: invites.map((i: any) => ({ id: String(i._id), email: i.email, createdAt: i.createdAt, expiresAt: i.expiresAt })),
    maxMembers: MAX_PET_MEMBERS,
  });
}

// POST /api/animals/:id/family/invites — { email }. Solo el dueño.
export async function invite(req: Request, res: Response) {
  const animal = await loadFamilyPet(req, res);
  if (!animal) return;
  const user: any = (req as any).user;
  if (!isPrimaryOwner(user, animal)) return res.status(403).json({ error: 'owner_only' });
  if (animal.memorial?.active) return res.status(409).json({ error: 'in_memory' });

  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
  if (!EMAIL_RX.test(email)) return res.status(400).json({ error: 'invalid_email' });

  const me: any = await User.findById(uidOf(req)).select('name email profile.firstName').lean();
  if (me?.email && String(me.email).toLowerCase() === email) return res.status(400).json({ error: 'cannot_invite_self' });

  // ¿Ya está dentro? Se busca la cuenta por correo, sin distinguir mayúsculas
  // (el alta normaliza, pero hay cuentas viejas).
  const invitee: any = await User.findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
    .select('_id role')
    .lean();
  const memberIds = familyMemberIds(animal);
  if (invitee) {
    const inviteeId = String(invitee._id);
    if (inviteeId === String(familyOwnerId(animal))) return res.status(400).json({ error: 'cannot_invite_self' });
    if (memberIds.includes(inviteeId)) return res.status(409).json({ error: 'already_member' });
  }

  // Reenviar a quien ya tenía una pendiente la sustituye: el enlace viejo deja de valer.
  await PetInvite.updateMany(
    { animalId: animal._id, email, status: 'pending' },
    { $set: { status: 'revoked', respondedAt: new Date() } },
  );
  const pending = await PetInvite.countDocuments({ animalId: animal._id, status: 'pending', expiresAt: { $gt: new Date() } });
  if (memberIds.length + pending >= MAX_PET_MEMBERS) return res.status(409).json({ error: 'too_many_members', max: MAX_PET_MEMBERS });

  const token = crypto.randomBytes(24).toString('base64url');
  const doc = await PetInvite.create({
    animalId: animal._id,
    invitedBy: new Types.ObjectId(uidOf(req)),
    email,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + PET_INVITE_DAYS * 24 * 3_600_000),
  });

  const who = firstName(me);
  const link = `${FRONTEND_URL()}/compartir/${token}`;
  const subject = `${who} quiere compartir contigo a ${animal.name} en MyPetLive`;
  const text =
    `${who} te invita a cuidar de ${animal.name} en MyPetLive.\n\n` +
    `Podréis apuntar las comidas y los paseos, su salud y sus vacunas, y os llegarán a los dos los avisos (por ejemplo, si se pierde y alguien la ve).\n\n` +
    `Acepta la invitación aquí: ${link}\n\n` +
    `El enlace caduca en ${PET_INVITE_DAYS} días. Si no conoces a ${who}, ignora este correo.`;
  sendEmail(
    email,
    subject,
    text,
    brandedEmail({
      preheader: `${who} te invita a cuidar de ${animal.name}.`,
      heading: `${escapeHtml(who)} quiere compartir a ${escapeHtml(animal.name)} contigo`,
      bodyHtml:
        `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;">Podréis apuntar las comidas y los paseos, su salud y sus vacunas, y os llegarán a los dos los avisos: por ejemplo, si se pierde y alguien la ve.</p>`,
      button: { text: 'Aceptar la invitación', url: link },
      footnote: `El enlace caduca en ${PET_INVITE_DAYS} días. Si no conoces a ${escapeHtml(who)}, ignora este correo.`,
    }),
  ).catch(err => logger.error({ err, animalId: String(animal._id) }, '[compartir] fallo al enviar la invitación'));

  // A una cuenta de protectora, tienda o veterinario se le crea y se le envía como
  // a cualquiera (AUD-3): así el dueño no distingue qué correos son cuentas
  // profesionales. No podrá aceptarla (accept exige familia). Sin push: se acepta
  // con el enlace del correo, y el aviso al móvil solo va a familias.
  if (invitee && invitee.role === 'tenant') {
    sendPushToUser(String(invitee._id), {
      title: `${who} quiere compartir a ${animal.name} contigo`,
      body: 'Te hemos enviado un correo con el enlace para aceptarla.',
      url: '/pet',
    }).catch(() => undefined);
  }

  res.status(201).json({
    id: String(doc._id),
    email,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    // Solo en tests: el token únicamente sale por correo.
    ...(process.env.NODE_ENV === 'test' ? { token } : {}),
  });
}

// DELETE /api/animals/:id/family/invites/:inviteId — el dueño la anula.
export async function revokeInvite(req: Request, res: Response) {
  const animal = await loadFamilyPet(req, res);
  if (!animal) return;
  if (!isPrimaryOwner((req as any).user, animal)) return res.status(403).json({ error: 'owner_only' });
  if (!Types.ObjectId.isValid(req.params.inviteId)) return res.status(404).json({ error: 'not_found' });
  const result = await PetInvite.updateOne(
    { _id: req.params.inviteId, animalId: animal._id, status: 'pending' },
    { $set: { status: 'revoked', respondedAt: new Date() } },
  );
  if (!result.matchedCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
}

// DELETE /api/animals/:id/family/members/:userId — el dueño quita a alguien, o
// un miembro se sale (`:userId` = el suyo o «me»).
export async function removeMember(req: Request, res: Response) {
  const animal = await loadFamilyPet(req, res);
  if (!animal) return;
  const me = uidOf(req);
  const target = req.params.userId === 'me' ? me : String(req.params.userId || '');
  const amOwner = isPrimaryOwner((req as any).user, animal);
  if (!amOwner && target !== me) return res.status(403).json({ error: 'owner_only' });
  if (!familyMemberIds(animal).includes(target)) return res.status(404).json({ error: 'not_member' });

  await Animal.updateOne({ _id: animal._id }, { $pull: { members: { userId: new Types.ObjectId(target) } } });

  // Avisar al otro lado, sin drama: es una gestión, no una alarma.
  const notifyId = target === me && !amOwner ? String(familyOwnerId(animal) || '') : target;
  if (notifyId && notifyId !== me) {
    const actor: any = await User.findById(me).select('name profile.firstName').lean();
    const body = target === me
      ? `${firstName(actor)} ya no comparte a ${animal.name} contigo.`
      : `Ya no tienes acceso a ${animal.name} en MyPetLive.`;
    sendPushToUser(notifyId, { title: animal.name, body, url: '/pet' }).catch(() => undefined);
  }
  res.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Lado de quien recibe la invitación (/api/pet-invites)
// ---------------------------------------------------------------------------

async function inviteByToken(token: unknown) {
  const raw = String(token || '').trim();
  if (!raw || raw.length > 200) return null;
  return PetInvite.findOne({ tokenHash: hashToken(raw) });
}

async function previewOf(invite: any) {
  const [animal, inviter]: any[] = await Promise.all([
    Animal.findById(invite.animalId).select('name species images memorial.active').lean(),
    User.findById(invite.invitedBy).select('name profile.firstName').lean(),
  ]);
  const expired = invite.status === 'pending' && invite.expiresAt <= new Date();
  return {
    id: String(invite._id),
    status: expired ? 'expired' : invite.status,
    email: maskEmail(invite.email),
    invitedBy: firstName(inviter),
    animal: animal ? { name: animal.name, species: animal.species, image: animal.images?.[0] || null } : null,
    expiresAt: invite.expiresAt,
  };
}

// GET /api/pet-invites/token/:token — vista previa del enlace del correo. Sin
// sesión: quien la recibe quizá aún no tiene cuenta. Solo nombre de pila,
// nombre y foto de la mascota: nada que no pusiera ya el correo.
export async function previewByToken(req: Request, res: Response) {
  const invite = await inviteByToken(req.params.token);
  if (!invite) return res.status(404).json({ error: 'not_found' });
  res.json(await previewOf(invite));
}

/** Invitaciones pendientes a mi correo: así las ve en la app sin abrir el correo. */
// Ya no se listan en la app (ver resolveInvite): eso enseñaba a quien se hubiera
// registrado con el correo ajeno quién le invitaba y a qué mascota. Se deja la
// ruta, vacía, para las versiones de la app que aún la llaman.
export async function listMine(_req: Request, res: Response) {
  res.json({ items: [] });
}

/**
 * La invitación que quiere responder: por token (el enlace del correo, vale
 * desde cualquier cuenta) o por id (desde la app, solo si fue a su correo).
 */
// Solo con el enlace del correo (decisión de Jorge, AUD-3): el alta no verifica
// el correo, así que quien se registrara con el de otra persona podía aceptar o
// rechazar desde la app invitaciones que no eran suyas. El enlace solo lo tiene
// quien lee ese buzón.
async function resolveInvite(req: Request) {
  if (req.body?.token) return inviteByToken(req.body.token);
  return null;
}

// POST /api/pet-invites/accept — { token } o { inviteId }.
export async function accept(req: Request, res: Response) {
  const user: any = (req as any).user;
  const me = uidOf(req);
  const invite: any = await resolveInvite(req);
  if (!invite) return res.status(404).json({ error: 'not_found' });
  if (invite.status === 'accepted' && String(invite.acceptedBy) === me) {
    return res.json({ ok: true, animalId: String(invite.animalId) });
  }
  if (invite.status !== 'pending') return res.status(410).json({ error: `invite_${invite.status}` });
  if (invite.expiresAt <= new Date()) return res.status(410).json({ error: 'invite_expired' });
  if (user?.role !== 'tenant') return res.status(403).json({ error: 'invitee_not_family' });

  const animal: any = await Animal.findById(invite.animalId);
  if (!animal || !isFamilyPet(animal)) return res.status(410).json({ error: 'animal_gone' });
  if (String(familyOwnerId(animal) || '') === me) return res.status(400).json({ error: 'already_owner' });
  // Si la mascota cambió de dueño (cesión) después de invitar, la invitación ya no es de nadie.
  if (String(familyOwnerId(animal) || '') !== String(invite.invitedBy)) {
    invite.status = 'revoked';
    invite.respondedAt = new Date();
    await invite.save();
    return res.status(410).json({ error: 'invite_revoked' });
  }

  // Atómico (AUD-2): primero se reclama la invitación (solo una petición lo
  // consigue, y una revocación entre medias se respeta) y solo entonces se añade
  // al miembro, con el tope en el propio filtro. Si eso falla, vuelve a pendiente.
  const reclamada = await PetInvite.findOneAndUpdate(
    { _id: invite._id, status: 'pending', expiresAt: { $gt: new Date() } },
    { $set: { status: 'accepted', acceptedBy: new Types.ObjectId(me), respondedAt: new Date() } },
    { new: true },
  );
  if (!reclamada) {
    // Doble toque o reintento de la misma persona (AUD-3): ya es suya, todo bien.
    const ahora: any = await PetInvite.findById(invite._id).lean();
    if (ahora?.status === 'accepted' && String(ahora.acceptedBy) === me) return res.json({ ok: true, animalId: String(invite.animalId) });
    return res.status(410).json({ error: 'invite_accepted' });
  }
  if (!familyMemberIds(animal).includes(me)) {
    const añadido = await Animal.updateOne(
      { _id: animal._id, 'members.userId': { $ne: new Types.ObjectId(me) }, [`members.${MAX_PET_MEMBERS - 1}`]: { $exists: false } },
      { $push: { members: { userId: new Types.ObjectId(me), addedAt: new Date(), invitedBy: invite.invitedBy } } },
    );
    if (!añadido.modifiedCount) {
      const yaEsta = await Animal.exists({ _id: animal._id, 'members.userId': new Types.ObjectId(me) });
      if (!yaEsta) {
        await PetInvite.updateOne({ _id: invite._id }, { $set: { status: 'pending' }, $unset: { acceptedBy: 1, respondedAt: 1 } });
        return res.status(409).json({ error: 'too_many_members', max: MAX_PET_MEMBERS });
      }
    }
  }

  const accepter: any = await User.findById(me).select('name profile.firstName').lean();
  sendPushToUser(String(invite.invitedBy), {
    title: `${firstName(accepter)} ya cuida de ${animal.name} contigo`,
    body: 'Os llegarán a los dos los avisos y veréis lo mismo en su ficha.',
    url: `/pet?mascota=${animal._id}`,
  }).catch(() => undefined);

  res.json({ ok: true, animalId: String(animal._id) });
}

// POST /api/pet-invites/decline — { token } o { inviteId }.
export async function decline(req: Request, res: Response) {
  const invite: any = await resolveInvite(req);
  if (!invite) return res.status(404).json({ error: 'not_found' });
  if (invite.status !== 'pending') return res.status(410).json({ error: `invite_${invite.status}` });
  invite.status = 'declined';
  invite.respondedAt = new Date();
  await invite.save();
  res.json({ ok: true });
}
