const FALLBACK_SECRET = 'insecure';

export function getJwtSecret(): string {
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'test') {
    return FALLBACK_SECRET;
  }

  const secret = process.env.JWT_SECRET;

  if (!secret || secret === FALLBACK_SECRET) {
    throw new Error('JWT_SECRET not configured. Define a strong secret in the environment.');
  }

  if (secret.length < 16) {
    throw new Error('JWT_SECRET too short. Use at least 16 characters.');
  }

  return secret;
}
