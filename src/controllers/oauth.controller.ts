import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import { getJwtSecret } from '../config/jwt';
import { AppError, badRequest, isAppError } from '../utils/errors';
import getRequestLogger from '../utils/requestLogger';
import { APPLE_OIDC, GOOGLE_OIDC, verifyIdToken, OidcClaims } from '../utils/oidc';

const JWT_SECRET = getJwtSecret();

export type SocialProvider = 'google' | 'apple';

function providerConfig(provider: SocialProvider) {
  if (provider === 'google') {
    const audience = process.env.GOOGLE_CLIENT_ID;
    if (!audience) return null;
    return { ...GOOGLE_OIDC, audience };
  }
  // En Apple el "client id" es el Services ID del sitio web, que no coincide
  // con el bundle id de la app móvil: si algún día se firma también desde la
  // app nativa habrá que aceptar las dos audiencias.
  const audience = process.env.APPLE_CLIENT_ID;
  if (!audience) return null;
  return { ...APPLE_OIDC, audience };
}

function displayNameFrom(claims: OidcClaims, bodyName: unknown, email: string) {
  const fromBody = typeof bodyName === 'string' ? bodyName.trim() : '';
  // Apple solo manda el nombre en la PRIMERA autorización y fuera del token,
  // así que el front nos lo pasa por el body cuando lo tiene.
  if (fromBody) return fromBody.slice(0, 80);
  const fromToken = typeof claims.name === 'string' ? claims.name.trim() : '';
  if (fromToken) return fromToken.slice(0, 80);
  return email.split('@')[0];
}

function isEmailVerified(claims: OidcClaims) {
  const raw = claims.email_verified;
  return raw === true || raw === 'true';
}

/**
 * Alta o entrada con Google / Apple.
 *
 * Recibe el ID token que el proveedor le ha dado al navegador, lo verifica
 * contra el JWKS del emisor y devuelve exactamente la misma respuesta que
 * `login` para que el front no tenga que distinguir el origen de la sesión.
 *
 * Como el registro público, siempre crea adoptantes (`tenant`): los roles
 * profesionales se activan a mano.
 */
export const socialLogin = async (req: Request, res: Response) => {
  const log = getRequestLogger(req);
  const provider = String(req.params.provider || '').toLowerCase() as SocialProvider;
  if (provider !== 'google' && provider !== 'apple') {
    throw badRequest('unsupported_provider');
  }

  const config = providerConfig(provider);
  if (!config) {
    // Sin credenciales configuradas el botón no debería ni aparecer en el
    // front; si llega una petición igualmente, se dice claramente por qué no.
    throw new AppError('El acceso con este proveedor no está configurado', {
      status: 503,
      code: 'provider_not_configured',
    });
  }

  const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
  if (!idToken) throw badRequest('missing_id_token');

  let claims: OidcClaims;
  try {
    claims = await verifyIdToken(idToken, config);
  } catch (error: any) {
    log.warn({ err: error, provider }, 'ID token social rechazado');
    throw new AppError('No hemos podido validar tu identidad', {
      status: 401,
      code: 'invalid_id_token',
    });
  }

  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!email) throw badRequest('email_not_shared');
  if (!isEmailVerified(claims)) {
    throw new AppError('El proveedor no confirma tu correo', {
      status: 403,
      code: 'email_not_verified_by_provider',
    });
  }

  try {
    let user = await User.findOne({ email });
    if (user) {
      // Cuenta existente (con contraseña o no): se vincula el proveedor. Es
      // seguro porque el emisor ya ha verificado que ese correo es suyo.
      const already = (user.authProviders || []).some(
        (p: any) => p.provider === provider && p.sub === claims.sub,
      );
      if (!already) {
        user.authProviders = [
          ...(user.authProviders || []).filter((p: any) => p.provider !== provider),
          { provider, sub: claims.sub },
        ] as any;
        await user.save();
      }
    } else {
      user = await User.create({
        name: displayNameFrom(claims, req.body?.name, email),
        email,
        role: 'tenant',
        authProviders: [{ provider, sub: claims.sub }],
      });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { _id: user._id, email: user.email, role: user.role },
    });
  } catch (error: any) {
    if (isAppError(error)) throw error;
    if (error?.code === 11000 || /duplicate key/i.test(error?.message || '')) {
      // Carrera entre dos altas simultáneas con el mismo correo.
      throw new AppError('email_in_use', { status: 409, code: 'email_in_use' });
    }
    log.error({ err: error, provider }, 'Error en login social');
    throw new AppError('Error del servidor', { status: 500, code: 'social_login_failed' });
  }
};
