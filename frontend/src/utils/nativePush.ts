import { PushNotifications } from '@capacitor/push-notifications';
import { AppLauncher } from '@capacitor/app-launcher';
import api from '../api/client';
import { isNativeApp } from './native';

// Notificaciones de la app de iPhone (APNs). En la web siguen siendo Web Push
// (utils/webPush). Android necesitaría Firebase y no se activa: sin él la app se cerraría.

const KEY = 'mpl.nativePushToken';

export function nativePushAvailable(): boolean {
  return isNativeApp() && (window as any).Capacitor?.getPlatform?.() === 'ios';
}

function storedToken(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export async function getNativePushEnabled(): Promise<boolean> {
  if (!nativePushAvailable()) return false;
  return (await PushNotifications.checkPermissions()).receive === 'granted' && !!storedToken();
}

/** Si la persona dijo que no en el diálogo de Apple, iOS no deja volver a preguntar. */
export async function nativePushDenied(): Promise<boolean> {
  if (!nativePushAvailable()) return false;
  return (await PushNotifications.checkPermissions()).receive === 'denied';
}

/** Abre Ajustes del iPhone › MyPetLive, donde está el interruptor de Notificaciones. */
export async function openNativeSettings(): Promise<void> {
  await AppLauncher.openUrl({ url: 'app-settings:' });
}

let listenersReady = false;

async function ensureListeners(onToken?: (t: string) => void) {
  if (listenersReady) return;
  listenersReady = true;
  await PushNotifications.addListener('registration', ({ value }) => {
    try { localStorage.setItem(KEY, value); } catch { /* se registra de nuevo al abrir */ }
    api.post('/api/push/native', { token: value, platform: 'ios' }).catch(() => undefined);
    onToken?.(value);
  });
  // Tocar la notificación abre su pantalla (el payload trae `url`, como el Web Push).
  await PushNotifications.addListener('pushNotificationActionPerformed', action => {
    const url = action.notification.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) window.location.assign(url);
  });
}

/** Pide permiso (si hace falta) y registra este iPhone. Lanza 'permission_denied' si lo niega. */
export async function enableNativePush(): Promise<void> {
  let state = (await PushNotifications.checkPermissions()).receive;
  if (state === 'prompt' || state === 'prompt-with-rationale') state = (await PushNotifications.requestPermissions()).receive;
  if (state !== 'granted') throw new Error('permission_denied');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('registration_timeout')), 15000);
    ensureListeners(() => { clearTimeout(timer); resolve(); })
      .then(() => PushNotifications.register())
      .catch(err => { clearTimeout(timer); reject(err); });
    // Si los listeners ya existían, el token llega por el listener anterior: basta con que se guarde.
    if (listenersReady) setTimeout(() => { if (storedToken()) { clearTimeout(timer); resolve(); } }, 3000);
  });
}

/** Al abrir la app con sesión: si ya dio permiso, renueva el token (Apple puede cambiarlo). */
export async function refreshNativePush(): Promise<void> {
  if (!nativePushAvailable()) return;
  if ((await PushNotifications.checkPermissions()).receive !== 'granted') return;
  await ensureListeners();
  await PushNotifications.register();
}

/** Desactivar en el perfil o cerrar sesión: el servidor deja de avisar a este móvil. */
// `authToken`: al cerrar sesión la cabecera se borra antes de que salga la
// petición, así que se pasa explícita.
export async function disableNativePush(authToken?: string): Promise<void> {
  const token = storedToken();
  try { localStorage.removeItem(KEY); } catch { /* nada */ }
  if (!token) return;
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
  await api.delete('/api/push/native', { data: { token }, headers }).catch(() => undefined);
}
