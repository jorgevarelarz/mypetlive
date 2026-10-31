// Quién puede tocar la ficha de un animal. El admin siempre. En una mascota de
// familia (adoptada o personal) solo su dueño (`ownerId`): la protectora o el
// particular que la dio en adopción sigue figurando en `shelter`, pero ya no
// la gestiona. En un animal de protectora, la protectora (`shelter`) o quien
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

export function canManageAnimal(user: any, animal: any) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const uid = String(user._id || user.id || '');
  if (!uid) return false;
  if (isFamilyPet(animal)) return String(familyOwnerId(animal) || '') === uid;
  // `animal.shelter` puede llegar poblado (p.ej. `getById` hace
  // `.populate('shelter', 'name email')` para pintar el nombre): ahí es un
  // documento de User, no el ObjectId, y compararlo con `String()` a pelo
  // nunca casa con nadie.
  const shelterId = animal.shelter?._id ?? animal.shelter;
  const ownerId = animal.ownerId?._id ?? animal.ownerId;
  return String(shelterId || '') === uid || String(ownerId || '') === uid;
}
