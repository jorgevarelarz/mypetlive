import api from '../api/client';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export type PushSupport = 'ok' | 'needs-install' | 'unsupported';

/** En iOS el push web solo funciona con la app instalada en pantalla de inicio. */
export function pushSupport(): PushSupport {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  return 'ok';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(Array.from(raw, c => c.charCodeAt(0)));
}

export async function getPushEnabled(): Promise<boolean> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
  const sub = await reg?.pushManager.getSubscription();
  return Boolean(sub);
}

export async function enablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.register('/push-sw.js');
  await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission_denied');
  const { data } = await api.get('/api/push/vapid-key');
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });
  await api.post('/api/push/subscribe', { subscription: subscription.toJSON() });
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.delete('/api/push/subscribe', { data: { endpoint: sub.endpoint } });
    await sub.unsubscribe();
  }
}

export async function sendTestPush(): Promise<void> {
  await api.post('/api/push/test');
}
