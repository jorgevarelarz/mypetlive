import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { verifyIdToken, resetJwksCache } from '../utils/oidc';

// Verificación de la firma de los ID token de Google/Apple: es la única barrera
// entre "he entrado con Google" y "me he inventado un token", así que se prueba
// contra un JWKS real generado al vuelo.

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'clave-de-prueba';

const jwks = {
  keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' }],
};

const CONFIG = {
  jwksUrl: 'https://ejemplo.test/certs',
  issuer: 'https://accounts.google.com',
  audience: 'mi-client-id',
};

const sign = (payload: object, options: jwt.SignOptions = {}) =>
  jwt.sign(payload, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, {
    algorithm: 'RS256',
    keyid: KID,
    expiresIn: '5m',
    ...options,
  });

const fetchMock = jest.fn();

beforeEach(() => {
  resetJwksCache();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => jwks });
  (global as any).fetch = fetchMock;
});

describe('verifyIdToken', () => {
  it('acepta un token bien firmado y devuelve sus claims', async () => {
    const token = sign({
      sub: 'usuario-1',
      email: 'a@b.es',
      email_verified: true,
      iss: CONFIG.issuer,
      aud: CONFIG.audience,
    });

    const claims = await verifyIdToken(token, CONFIG);

    expect(claims.sub).toBe('usuario-1');
    expect(claims.email).toBe('a@b.es');
  });

  it('rechaza un token firmado con otra clave', async () => {
    const otra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = jwt.sign(
      { sub: 'x', iss: CONFIG.issuer, aud: CONFIG.audience },
      otra.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
      { algorithm: 'RS256', keyid: KID, expiresIn: '5m' },
    );

    await expect(verifyIdToken(token, CONFIG)).rejects.toThrow();
  });

  it('rechaza un token para otro client id', async () => {
    const token = sign({ sub: 'x', iss: CONFIG.issuer, aud: 'client-id-de-otro' });

    await expect(verifyIdToken(token, CONFIG)).rejects.toThrow();
  });

  it('rechaza un token de otro emisor', async () => {
    const token = sign({ sub: 'x', iss: 'https://malo.test', aud: CONFIG.audience });

    await expect(verifyIdToken(token, CONFIG)).rejects.toThrow();
  });

  it('rechaza un token caducado', async () => {
    const token = sign({ sub: 'x', iss: CONFIG.issuer, aud: CONFIG.audience }, { expiresIn: -10 });

    await expect(verifyIdToken(token, CONFIG)).rejects.toThrow();
  });

  it('rechaza alg=none aunque el kid exista', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT', kid: KID })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({ sub: 'x', iss: CONFIG.issuer, aud: CONFIG.audience }),
    ).toString('base64url');

    await expect(verifyIdToken(`${header}.${payload}.`, CONFIG)).rejects.toThrow('unsupported_alg');
  });

  it('rechaza un HS256 firmado con el propio PEM público (confusión de algoritmo)', async () => {
    const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    const token = jwt.sign({ sub: 'x', iss: CONFIG.issuer, aud: CONFIG.audience }, pem, {
      algorithm: 'HS256',
      keyid: KID,
      expiresIn: '5m',
    });

    await expect(verifyIdToken(token, CONFIG)).rejects.toThrow('unsupported_alg');
  });

  it('rechaza un kid desconocido y no se queda con el JWKS viejo', async () => {
    const token = sign({ sub: 'x', iss: CONFIG.issuer, aud: CONFIG.audience }, { keyid: 'otro-kid' });

    await expect(verifyIdToken(token, CONFIG)).rejects.toThrow('unknown_kid');
  });

  it('cachea el JWKS entre verificaciones', async () => {
    const token = sign({ sub: 'x', iss: CONFIG.issuer, aud: CONFIG.audience });

    await verifyIdToken(token, CONFIG);
    await verifyIdToken(token, CONFIG);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('admite el emisor de Google con y sin esquema', async () => {
    const token = sign({ sub: 'x', iss: 'accounts.google.com', aud: CONFIG.audience });

    const claims = await verifyIdToken(token, {
      ...CONFIG,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
    });

    expect(claims.sub).toBe('x');
  });
});
