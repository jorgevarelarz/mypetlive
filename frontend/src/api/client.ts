import axios, { type InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';

const fallbackBase = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  if ((process.env as any).VITE_API_URL) return (process.env as any).VITE_API_URL;
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
};

/** Avisa a AuthContext de que el servidor ya no acepta la sesión guardada. */
export const SESSION_EXPIRED_EVENT = 'mypetlive:session-expired';

export const API_BASE = fallbackBase().replace(/\/$/, '');

export const api = axios.create({ baseURL: API_BASE });

// Request: inject Authorization and dev-only x-admin for admin routes
// En entorno de test algunos mocks de axios no implementan interceptors;
// protegemos las llamadas para evitar TypeError en Jest.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - api puede ser un mock parcial en tests
api?.interceptors?.request?.use?.((config: InternalAxiosRequestConfig) => {
  try {
    // Authorization from stored user
    const raw = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (raw) {
      const u = JSON.parse(raw || 'null');
      if (u?.token) {
        (config.headers as any) = { ...(config.headers || {}), Authorization: `Bearer ${u.token}` };
      }
      // Dev-only admin header for admin routes
      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev && u?.role === 'admin' && config.url && /\/api\/admin\//.test(config.url)) {
        (config.headers as any) = { ...(config.headers || {}), 'x-admin': 'true' };
      }
    }
  } catch {}
  return config;
});

// Response: toast errors globally (excluding auth endpoints)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
api?.interceptors?.response?.use?.(
  (res) => res,
  (err) => {
    try {
      const url = err?.config?.url || '';
      // `skipErrorToast` en la config de la petición: para endpoints cuyos códigos
      // de error traduce la página (p. ej. el checkout de donación), evita el toast
      // genérico que pintaba el código crudo del backend además del mensaje bueno.
      // No afecta al 401: la sesión caducada se sigue gestionando siempre.
      const skipToast = (err?.config as any)?.skipErrorToast === true;
      if (!/\/api\/auth\//.test(url)) {
        // Sesión caducada: sin esto cada llamada devolvía 401 en
        // silencio y la UI parecía rota (p. ej. el QR de canje "no salía").
        // Solo si HAY usuario guardado: al anónimo de páginas públicas no se le toca.
        const hasSession = typeof window !== 'undefined' && !!localStorage.getItem('user');
        if (err?.response?.status === 401 && hasSession) {
          localStorage.removeItem('user');
          // Primero la salida y después el aviso: si el aviso fallaba, el catch de
          // abajo se lo tragaba y nadie llevaba al usuario al login. Se quedaba en
          // «No hemos podido comprobar tu aceptación» con la sesión ya borrada.
          window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
          if (!window.location.pathname.startsWith('/login')) {
            setTimeout(() => window.location.assign('/login'), 600);
          }
          toast.error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
          return Promise.reject(err);
        }
        if (skipToast) return Promise.reject(err);
        const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Error de red';
        toast.error(msg);
      }
    } catch {}
    return Promise.reject(err);
  }
);

export default api;
