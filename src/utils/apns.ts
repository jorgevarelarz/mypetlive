import http2 from 'http2';
import { createPrivateKey, sign } from 'crypto';
import { readFileSync } from 'fs';
import { NativePushToken } from '../models/nativePushToken.model';
import logger from './logger';

// Notificaciones a la app de iPhone: directo a APNs (HTTP/2 + JWT ES256 con la
// clave .p8 del equipo de Apple). Misma clave para todas las apps de la cuenta;
// el `apns-topic` (bundle id) decide a qué app va.
// Env: APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_PATH, APNS_TOPIC (es.mypetlive.app).

const HOSTS = { production: 'https://api.push.apple.com', sandbox: 'https://api.sandbox.push.apple.com' };
let jwt = { value: '', at: 0 };

export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY_PATH);
}

function providerToken(): string {
  // Apple pide renovarlo entre 20 y 60 minutos.
  if (jwt.value && Date.now() - jwt.at < 40 * 60_000) return jwt.value;
  const b64 = (x: object) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const head = b64({ alg: 'ES256', kid: process.env.APNS_KEY_ID });
  const body = b64({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) });
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), {
    key: createPrivateKey(readFileSync(process.env.APNS_KEY_PATH as string)),
    dsaEncoding: 'ieee-p1363',
  });
  jwt = { value: `${head}.${body}.${sig.toString('base64url')}`, at: Date.now() };
  return jwt.value;
}

function post(host: string, deviceToken: string, payload: object): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve, reject) => {
    const client = http2.connect(host);
    client.on('error', reject);
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken()}`,
      'apns-topic': process.env.APNS_TOPIC || 'es.mypetlive.app',
      'apns-push-type': 'alert',
      'content-type': 'application/json',
    });
    let status = 0;
    let data = '';
    req.on('response', h => { status = Number(h[':status']); });
    req.on('data', d => { data += d; });
    req.on('end', () => {
      client.close();
      let reason: string | undefined;
      try { reason = data ? JSON.parse(data).reason : undefined; } catch { reason = data; }
      resolve({ status, reason });
    });
    req.on('error', reject);
    req.end(JSON.stringify(payload));
  });
}

/** Avisa en todos los iPhone del usuario. `url` es la pantalla que se abre al tocarla. Nunca lanza. */
export async function sendApnsToUser(userId: string, msg: { title: string; body?: string; url?: string }): Promise<void> {
  if (!apnsConfigured()) return;
  const tokens = await NativePushToken.find({ userId, platform: 'ios' }).lean();
  const payload = { aps: { alert: { title: msg.title, body: msg.body || '' }, sound: 'default' }, url: msg.url || '/' };
  for (const t of tokens) {
    try {
      // TestFlight y App Store usan producción; una build instalada desde Xcode, sandbox.
      let r = await post(HOSTS.production, t.token, payload);
      if (r.status === 400 && r.reason === 'BadDeviceToken') r = await post(HOSTS.sandbox, t.token, payload);
      if (r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered') {
        await NativePushToken.deleteOne({ token: t.token });
      } else if (r.status !== 200) {
        logger.error({ userId, status: r.status, reason: r.reason }, '[apns] envío rechazado');
      }
    } catch (err) {
      logger.error({ err, userId }, '[apns] fallo de conexión');
    }
  }
}
