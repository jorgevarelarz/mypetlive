import { Request, Response, NextFunction } from 'express';

/**
 * Higher-order middleware to check whether the authenticated user's role is
 * included in the allowed roles list. If not, responds with 403. Assumes
 * authentication has already run and attached req.user.
 */
const normalizeRole = (role?: string) => {
  const r = String(role || '').toLowerCase();
  if (r === 'protectora' || r === 'shelter' || r === 'owner') return 'landlord';
  if (r === 'adoptante' || r === 'adopter') return 'tenant';
  return r;
};

export const authorizeRoles = (...roles: string[]) => {
  const allowed = new Set(roles.map(normalizeRole));
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = normalizeRole((req as any).user?.role);
    if (!userRole || !allowed.has(userRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    next();
  };
};
