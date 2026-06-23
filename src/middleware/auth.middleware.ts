import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/jwt';

const JWT_SECRET = getJwtSecret();

/**
 * Authentication middleware. Verifies a JWT from the Authorization header
 * (expected as a Bearer token) and attaches the decoded user payload to
 * the request object as req.user.
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    if (process.env.NODE_ENV === 'test') {
      const idHeader = (req.headers['x-user-id'] as string) || '000000000000000000000001';
      const roleHeader = (req.headers['x-user-role'] as string) || 'landlord';
      const verifiedHeader = req.headers['x-user-verified'];
      const isVerified =
        verifiedHeader !== undefined
          ? ['true', '1', 'yes'].includes(String(verifiedHeader).toLowerCase())
          : true;

      const fallbackUser = {
        id: idHeader,
        _id: idHeader,
        role: roleHeader,
        isVerified,
      };
      (req as any).user = fallbackUser;
      return next();
    }
    return res.status(401).json({ error: 'Token requerido' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const resolvedId = decoded._id || decoded.id;

    // Resolver isVerified del token si existe; no asumir false por defecto todavía
    let tokenVerified: boolean | undefined =
      decoded.isVerified ?? decoded.verified ?? decoded.is_verified ??
      (decoded.status ? decoded.status === 'verified' : undefined);

    // En entorno de test, permitir bypass cuando ALLOW_UNVERIFIED=true
    if (process.env.NODE_ENV === 'test' && process.env.ALLOW_UNVERIFIED === 'true') {
      // Permitir forzar vía cabecera si se proporciona (útil en tests negativos)
      const verifiedHeader = req.headers['x-user-verified'];
      if (verifiedHeader !== undefined) {
        tokenVerified = ['true', '1', 'yes'].includes(String(verifiedHeader).toLowerCase());
      } else if (typeof tokenVerified === 'undefined') {
        tokenVerified = true; // por defecto verificado en tests
      }
    }

    (req as any).user = {
      ...decoded,
      id: resolvedId,
      _id: resolvedId,
      isVerified: typeof tokenVerified === 'boolean' ? tokenVerified : false,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
};

/**
 * Optional authentication: if a valid Bearer token (or test headers) is present,
 * attaches req.user; otherwise continues anonymously without a 401.
 * Useful for public endpoints whose response varies for the owner (e.g. catálogo
 * de animales que para la protectora dueña muestra también borradores).
 */
export const optionalAuthenticate = (req: Request, _res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    if (process.env.NODE_ENV === 'test' && req.headers['x-user-id']) {
      (req as any).user = {
        id: req.headers['x-user-id'] as string,
        _id: req.headers['x-user-id'] as string,
        role: (req.headers['x-user-role'] as string) || 'tenant',
        isVerified: true,
      };
    }
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const resolvedId = decoded._id || decoded.id;
    (req as any).user = { ...decoded, id: resolvedId, _id: resolvedId };
  } catch {
    // Token inválido en endpoint público: continuar como anónimo.
  }
  next();
};
