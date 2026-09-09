const FALLBACK_SECRET = 'insecure';

// Valores de plantilla que NUNCA deben acabar firmando tokens reales: el que
// traía `.env.example` antes (un hex de 64 que parecía legítimo) y el marcador
// que lo sustituye. Si producción arranca con cualquiera de ellos, aborta.
const PLACEHOLDER_SECRETS = new Set([
  '4f8c1a27b95e6d30c4ed871f62a0b3d184fbc52d97e61a8f0c3d5b7e4a6c2981',
  'REEMPLAZAR_openssl_rand_hex_32',
]);

export function getJwtSecret(): string {
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'test') {
    return FALLBACK_SECRET;
  }

  const secret = process.env.JWT_SECRET;

  if (!secret || secret === FALLBACK_SECRET || PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error('JWT_SECRET not configured. Define a strong secret in the environment.');
  }

  if (secret.length < 16) {
    throw new Error('JWT_SECRET too short. Use at least 16 characters.');
  }

  return secret;
}
