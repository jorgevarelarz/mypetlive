import { Request, Response, NextFunction } from 'express';
import { Verification } from '../models/verification.model';
import { getUserId } from '../utils/getUserId';
import { isProduction } from '../utils/env';

/**
 * Middleware that ensures the requesting user has a verified status.
 * The user ID is expected in the `x-user-id` header.
 */
export const requireVerified = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const user: any = (req as any).user;

  // Always require an authenticated user in non-test environments
  if (!user) {
    if (process.env.NODE_ENV === 'test' && process.env.ALLOW_UNVERIFIED === 'true') {
      return next();
    }
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (user.role === 'admin') return next();
  if (user.isVerified) return next();

  // Only allow bypass outside production when explicitly enabled (e.g. local/test).
  // isProduction() y no NODE_ENV: el VPS corre NODE_ENV=development con APP_ENV=production.
  if (process.env.ALLOW_UNVERIFIED === 'true' && !isProduction()) {
    return next();
  }

  return res.status(403).json({ error: 'owner_not_verified' });
};
