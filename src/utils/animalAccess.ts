// Quién puede tocar la ficha de un animal: la protectora que lo tiene a su
// cargo (`shelter`) o la familia adoptante (`ownerId`), que en una mascota
// personal son la misma persona. El admin siempre.
//
// Vive aquí y no dentro de un controlador porque lo usan dos: el modo perdido
// (animal.controller) y la asignación de chapas físicas (tag.controller). Una
// comprobación de autorización duplicada es una comprobación que acaba
// divergiendo, y la mitad que se quede atrás es un agujero.
export function canManageAnimal(user: any, animal: any) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const uid = String(user._id || user.id || '');
  if (!uid) return false;
  // `animal.shelter` puede llegar poblado (p.ej. `getById` hace
  // `.populate('shelter', 'name email')` para pintar el nombre): ahí es un
  // documento de User, no el ObjectId, y compararlo con `String()` a pelo
  // nunca casa con nadie.
  const shelterId = animal.shelter?._id ?? animal.shelter;
  const ownerId = animal.ownerId?._id ?? animal.ownerId;
  return String(shelterId || '') === uid || String(ownerId || '') === uid;
}
