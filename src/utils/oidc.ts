import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Verificación de ID tokens OIDC (Google y Apple) contra el JWKS del emisor.
 *
 * No usamos `google-auth-library` porque Apple no tiene librería oficial y el
 * mecanismo es el mismo para los dos: bajar el JWKS, elegir la clave por `kid`
 * y validar la firma RS256 junto con `iss`, `aud` y la caducidad. Una única
 * función para ambos evita mantener dos caminos de verificación distintos.
 */

export type OidcProviderConfig = {
  jwksUrl: string;
  /** Google emite `iss` con y sin esquema, por eso admite lista. */
  issuer: string | readonly [string, ...string[]];
  audience: string;
};

export type OidcClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  [key: string]: unknown;
};

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string; use?: string };

const JWKS_TTL_MS = 60 * 60 * 1000;
const jwksCache = new Map<string, { fetchedAt: number; keys: Map<string, string> }>();

function jwkToPem(jwk: Jwk): string {
  // Node soporta importar la JWK directamente; de ahí sacamos el PEM que
  // entiende `jsonwebtoken`.
  const key = crypto.createPublicKey({ key: jwk as any, format: 'jwk' });
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

async function loadJwks(jwksUrl: string): Promise<Map<string, string>> {
  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`jwks_fetch_failed_${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = new Map<string, string>();
  for (const jwk of body.keys || []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    try {
      keys.set(jwk.kid, jwkToPem(jwk));
    } catch {
      // Una clave ilegible no debe tumbar el resto del juego de claves.
    }
  }
  if (!keys.size) throw new Error('jwks_empty');
  return keys;
}

async function getSigningKey(jwksUrl: string, kid: string): Promise<string> {
  const cached = jwksCache.get(jwksUrl);
  const fresh = cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS;
  if (fresh && cached!.keys.has(kid)) return cached!.keys.get(kid)!;

  // `kid` desconocido: el emisor pudo rotar la clave antes de que expire la
  // caché, así que se recarga aunque siga "fresca".
  const keys = await loadJwks(jwksUrl);
  jwksCache.set(jwksUrl, { fetchedAt: Date.now(), keys });
  const pem = keys.get(kid);
  if (!pem) throw new Error('unknown_kid');
  return pem;
}

/** Solo para tests: vacía la caché de claves entre casos. */
export function resetJwksCache() {
  jwksCache.clear();
}

export async function verifyIdToken(
  idToken: string,
  config: OidcProviderConfig,
): Promise<OidcClaims> {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header?.kid) {
    throw new Error('malformed_id_token');
  }
  if (decoded.header.alg !== 'RS256') throw new Error('unsupported_alg');

  const pem = await getSigningKey(config.jwksUrl, decoded.header.kid);
  // `algorithms` fijado a propósito: sin él, un token con alg=none o HS256
  // firmado con el PEM público pasaría la verificación.
  const claims = jwt.verify(idToken, pem, {
    algorithms: ['RS256'],
    issuer: config.issuer as string | [string, ...string[]],
    audience: config.audience,
  }) as OidcClaims;

  if (!claims?.sub) throw new Error('missing_sub');
  return claims;
}

export const GOOGLE_OIDC = {
  jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
  issuer: ['https://accounts.google.com', 'accounts.google.com'] as const,
};

export const APPLE_OIDC = {
  jwksUrl: 'https://appleid.apple.com/auth/keys',
  issuer: 'https://appleid.apple.com',
};
