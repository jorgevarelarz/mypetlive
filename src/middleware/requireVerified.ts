import { Request, Response, NextFunction } from 'express';
import { Verification } from '../models/verification.model';
import { getUserId } from '../utils/getUserId';

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

  // Only allow bypass in non-production when explicitly enabled (e.g. local/test)
  if (process.env.ALLOW_UNVERIFIED === 'true' && process.env.NODE_ENV !== 'production') {
    return next();
  }

  return res.status(403).json({ error: 'owner_not_verified' });
};
