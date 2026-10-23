import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { PushNotifications } from '@capacitor/push-notifications';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { nativePushAvailable, enableNativePush } from '../utils/nativePush';
import { MPL, MPL_FONT_DISPLAY } from '../styles/mypetlive';

// Pide el permiso de notificaciones la primera vez que alguien entra con sesión
// en la app de iPhone. Antes solo se activaban desde el Perfil, y ahí no llega
// casi nadie. Se explica para qué sirven ANTES del diálogo de Apple: si dice que
// no en el de Apple, iOS no deja volver a preguntar.
// Una sola vez por móvil: «Ahora no» se respeta y queda el interruptor del Perfil.

const KEY = 'mpl.notificationsAsked';
// Pantallas donde interrumpir sería peor: entrar, registrarse o aceptar textos legales.
const SKIP = ['/login', '/register', '/legal-consent', '/forgot-password', '/reset'];

const REASONS: Record<string, string[]> = {
  tenant: [
    'Si alguien encuentra a tu mascota y escanea su chapa',
    'Vacunas, desparasitaciones y citas en el veterinario',
    'Cómo va tu solicitud de adopción',
    'Mensajes nuevos y tus pedidos',
  ],
  landlord: [
    'Nuevas solicitudes de adopción',
    'Mensajes de los adoptantes',
    'Citas en el veterinario y vacunas de tus animales',
  ],
  vet: ['Nuevas solicitudes de cita', 'Cambios y cancelaciones', 'Mensajes nuevos'],
  store: ['Pedidos nuevos que preparar', 'Mensajes nuevos'],
};

function alreadyAsked(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
function markAsked() {
  try { localStorage.setItem(KEY, '1'); } catch { /* volverá a salir: mejor que fallar */ }
}

export default function NotificationsPrompt() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const loggedIn = Boolean(user?.token);
  const blocked = SKIP.some(p => pathname.startsWith(p));

  useEffect(() => {
    if (!loggedIn || blocked || open || !nativePushAvailable() || alreadyAsked()) return;
    let cancelled = false;
    // Un respiro para que la persona vea dónde ha entrado antes de preguntarle nada.
    const timer = setTimeout(async () => {
      try {
        const { receive } = await PushNotifications.checkPermissions();
        if (cancelled) return;
        // Ya dio permiso (o lo negó en Ajustes): no hay nada que preguntar.
        if (receive === 'prompt' || receive === 'prompt-with-rationale') setOpen(true);
        else markAsked();
      } catch { /* sin plugin no se pregunta */ }
    }, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [loggedIn, blocked, open]);

  if (!open) return null;

  const reasons = REASONS[(user as any)?.role] || REASONS.tenant;

  const close = () => { markAsked(); setOpen(false); };

  const accept = async () => {
    setBusy(true);
    try {
      await enableNativePush();
      toast.success('Avisos activados');
    } catch (e: any) {
      if (e?.message === 'permission_denied') {
        toast('Puedes activarlos cuando quieras desde tu Perfil.');
      } else {
        toast.error('No se pudieron activar. Inténtalo desde tu Perfil.');
      }
    } finally {
      setBusy(false);
      close();
    }
  };

  return createPortal(
    <div className="safe-top fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-prompt-title"
        className="w-full max-w-md bg-white"
        style={{
          borderRadius: '24px 24px 0 0',
          padding: '26px 22px calc(22px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ fontSize: 34, lineHeight: 1 }} aria-hidden>🔔</div>
        <h2
          id="notif-prompt-title"
          style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 23, fontWeight: 700, color: MPL.ink, margin: '12px 0 6px' }}
        >
          ¿Te avisamos?
        </h2>
        <p style={{ color: MPL.muted, fontSize: 15, margin: 0 }}>
          Solo de lo que te importa:
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gap: 10 }}>
          {reasons.map(r => (
            <li key={r} style={{ display: 'flex', gap: 10, color: MPL.ink, fontSize: 15 }}>
              <span aria-hidden style={{ color: MPL.teal, fontWeight: 800 }}>✓</span>
              {r}
            </li>
          ))}
        </ul>
        <div style={{ display: 'grid', gap: 8, marginTop: 22 }}>
          <button
            type="button"
            onClick={accept}
            disabled={busy}
            style={{ background: MPL.coral, color: '#fff', border: 0, borderRadius: 14, padding: '14px 18px', font: 'inherit', fontWeight: 800, fontSize: 16, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'Un momento…' : 'Activar avisos'}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            style={{ background: 'transparent', color: MPL.muted, border: 0, padding: '10px 18px', font: 'inherit', fontWeight: 700, fontSize: 15 }}
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
