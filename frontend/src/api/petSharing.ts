import { api as client } from './client';

// Mascota compartida (ver src/controllers/petSharing.controller.ts en el servidor).

export type FamilyPerson = { userId: string; name: string; email?: string; isMe: boolean; addedAt?: string };
export type FamilyInvite = { id: string; email: string; createdAt: string; expiresAt: string };
export type PetFamily = {
  me: 'owner' | 'member';
  owner: FamilyPerson | null;
  members: FamilyPerson[];
  invites: FamilyInvite[];
  maxMembers: number;
};

export type InvitePreview = {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
  email: string;
  invitedBy: string;
  animal: { name: string; species?: string; image?: string | null } | null;
  expiresAt: string;
};

export async function getPetFamily(animalId: string) {
  const { data } = await client.get(`/api/animals/${animalId}/family`);
  return data as PetFamily;
}

export async function invitePetFamily(animalId: string, email: string) {
  const { data } = await client.post(`/api/animals/${animalId}/family/invites`, { email });
  return data as FamilyInvite;
}

export async function revokePetInvite(animalId: string, inviteId: string) {
  await client.delete(`/api/animals/${animalId}/family/invites/${inviteId}`);
}

/** `userId` = 'me' para salirse. */
export async function removePetMember(animalId: string, userId: string) {
  await client.delete(`/api/animals/${animalId}/family/members/${userId}`);
}

export async function previewPetInvite(token: string) {
  const { data } = await client.get(`/api/pet-invites/token/${encodeURIComponent(token)}`);
  return data as InvitePreview;
}

export async function listMyPetInvites() {
  const { data } = await client.get('/api/pet-invites/mine');
  return data as { items: InvitePreview[] };
}

export async function acceptPetInvite(by: { token: string } | { inviteId: string }) {
  const { data } = await client.post('/api/pet-invites/accept', by);
  return data as { ok: true; animalId: string };
}

export async function declinePetInvite(by: { token: string } | { inviteId: string }) {
  await client.post('/api/pet-invites/decline', by);
}

/** Mensaje para la persona a partir del código de error del servidor. */
export function sharingErrorMessage(error: any, fallback = 'No se ha podido. Inténtalo de nuevo.'): string {
  const code = error?.response?.data?.error;
  const messages: Record<string, string> = {
    invalid_email: 'Ese correo no parece válido.',
    cannot_invite_self: 'Ese correo es el tuyo.',
    already_member: 'Esa persona ya la cuida contigo.',
    invitee_not_family: 'Ese correo es de una cuenta de protectora, veterinario o tienda. Invita a su cuenta personal.',
    too_many_members: 'Ya hay el máximo de personas (5). Quita a alguien o anula una invitación.',
    owner_only: 'Esto solo lo puede hacer quien dio de alta la mascota.',
    in_memory: 'No se puede invitar a nadie mientras está en su mural.',
    invite_expired: 'La invitación ha caducado. Pide que te la reenvíen.',
    invite_revoked: 'Esta invitación ya no vale. Pide que te manden otra.',
    invite_declined: 'Esta invitación se rechazó.',
    invite_accepted: 'Esta invitación ya la ha aceptado otra cuenta.',
    already_owner: 'Esta mascota ya es tuya.',
    animal_gone: 'Esa mascota ya no está en MyPetLive.',
    not_found: 'No encontramos esta invitación.',
  };
  if (error?.response?.status === 429) return 'Demasiadas invitaciones seguidas. Espera un rato.';
  return messages[code] || fallback;
}
