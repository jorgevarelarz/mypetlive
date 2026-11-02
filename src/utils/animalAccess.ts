// Quién puede tocar la ficha de un animal. El admin siempre. En una mascota de
// familia (adoptada o personal) su dueño (`ownerId`) y las personas con las
// que la comparte (`members`): la protectora o el particular que la dio en
// adopción sigue figurando en `shelter`, pero ya no la gestiona. En un animal de protectora, la protectora (`shelter`) o quien
// figure como `ownerId`, que ahí coincide con ella.
//
// Vive aquí y no dentro de un controlador porque lo usan varios: la ficha y el
// modo perdido (animal.controller), las chapas físicas (tag.controller) y el
// mural (memorial.controller). Una comprobación de autorización duplicada es
// una comprobación que acaba divergiendo, y la mitad que se quede atrás es un
// agujero.

/** Mascota de familia: ya no es de la protectora, aunque `shelter` la siga nombrando. */
export function isFamilyPet(animal: any) {
  return animal?.isPersonalPet === true || animal?.status === 'adoptado';
}

/**
 * Dueño de una mascota de familia. Si no hay `ownerId` (una protectora que la
 * marcó `adoptado` a mano, sin adopción en la plataforma), `shelter`: así la
 * ficha no se queda sin nadie que pueda gestionarla.
 */
export function familyOwnerId(animal: any) {
  const ownerId = animal?.ownerId?._id ?? animal?.ownerId;
  if (ownerId) return ownerId;
  return animal?.shelter?._id ?? animal?.shelter;
}

const idOf = (value: any) => String(value?._id ?? value ?? '');

/** Ids de las personas con las que el dueño comparte la mascota. */
export function familyMemberIds(animal: any): string[] {
  if (!isFamilyPet(animal)) return [];
  return (animal?.members || []).map((m: any) => idOf(m?.userId)).filter(Boolean);
}

/** ¿Es esta persona una de las invitadas a cuidar la mascota (no el dueño)? */
export function isFamilyMember(user: any, animal: any) {
  const uid = String(user?._id || user?.id || '');
  return !!uid && familyMemberIds(animal).includes(uid);
}

/**
 * Lo que es solo del dueño de una mascota de familia: invitar y quitar a otras
 * personas y despedirla en el mural. El admin también. En un animal de
 * protectora coincide con `canManageAnimal`.
 */
export function isPrimaryOwner(user: any, animal: any) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const uid = String(user._id || user.id || '');
  if (!uid) return false;
  if (isFamilyPet(animal)) return idOf(familyOwnerId(animal)) === uid;
  return canManageAnimal(user, animal);
}

/**
 * A quién le llegan los avisos de una mascota (la han visto, le toca la vacuna,
 * se acaba el pienso…): el dueño —o la protectora si aún está a su cargo— y,
 * en una mascota de familia, todas las personas con las que la comparte. Sin
 * repetidos y con el dueño primero.
 */
export function familyRecipientIds(animal: any): string[] {
  const owner = idOf(animal?.ownerId || animal?.shelter);
  const ids = [owner, ...familyMemberIds(animal)].filter(Boolean);
  return [...new Set(ids)];
}

export function canManageAnimal(user: any, animal: any) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const uid = String(user._id || user.id || '');
  if (!uid) return false;
  if (isFamilyPet(animal)) return idOf(familyOwnerId(animal)) === uid || familyMemberIds(animal).includes(uid);
  // `animal.shelter` puede llegar poblado (p.ej. `getById` hace
  // `.populate('shelter', 'name email')` para pintar el nombre): ahí es un
  // documento de User, no el ObjectId, y compararlo con `String()` a pelo
  // nunca casa con nadie.
  const shelterId = animal.shelter?._id ?? animal.shelter;
  const ownerId = animal.ownerId?._id ?? animal.ownerId;
  return String(shelterId || '') === uid || String(ownerId || '') === uid;
}
