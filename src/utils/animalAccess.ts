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
  return String(animal.shelter) === uid || String(animal.ownerId || '') === uid;
}
