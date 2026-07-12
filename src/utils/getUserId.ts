import { Request } from 'express';

/**
 * Retrieves the user ID from the authenticated request.
 * Priority:
 * 1) `req.user.id` (set by auth middleware when using JWTs)
 * 2) `x-user-id` header — SOLO en tests. Fuera de test este header es
 *    ignorado: es controlable por el cliente y, en una ruta que olvidara
 *    `authenticate`, permitiría suplantar a cualquier usuario.
 * If neither is present, throws a 400 error.
 */
export function getUserId(req: Request): string {
  const u: any = (req as any).user;
  if (u?.id || u?._id) return String(u.id || u._id);
  if (process.env.NODE_ENV === 'test') {
    const uid = req.header('x-user-id');
    if (uid) return String(uid);
  }
  throw Object.assign(new Error('Missing user identity'), { status: 400 });
}
