import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { pushSupport, getPushEnabled, enablePush, disablePush, sendTestPush } from '../../utils/webPush';
import { nativePushAvailable, nativePushDenied, openNativeSettings } from '../../utils/nativePush';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

// Ajustes del dispositivo y de la cuenta que no son datos personales. Las
// notificaciones vivían en el Perfil, mezcladas con nombre y correo.

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 }}>
      <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, margin: '0 0 16px' }}>{title}</h2>
      <div style={{ display: 'grid', gap: 14 }}>{children}</div>
    </div>
  );
}

function PushPanel() {
  const support = useMemo(() => pushSupport(), []);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  // En el iPhone, tras un «No permitir» ya no sale el diálogo: solo queda
  // mandar a la persona a Ajustes del iPhone.
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (support === 'ok') getPushEnabled().then(setEnabled).catch(() => {});
  }, [support]);

  useEffect(() => {
    if (!nativePushAvailable()) return;
    // Al volver de Ajustes del iPhone: si las ha activado allí, se registra el
    // móvil sin que tenga que pulsar nada más.
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const isDenied = await nativePushDenied().catch(() => false);
      setDenied(isDenied);
      if (isDenied) return;
      const on = await getPushEnabled().catch(() => false);
      if (!on && denied) {
        try { await enablePush(); setEnabled(true); toast.success('Notificaciones activadas'); } catch { /* sigue el botón */ }
      } else {
        setEnabled(on);
      }
    };
    void check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [denied]);

  const toggle = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        toast.success('Notificaciones desactivadas');
      } else {
        await enablePush();
        setEnabled(true);
        toast.success('Notificaciones activadas');
      }
    } catch (e: any) {
      if (e?.message === 'permission_denied' && nativePushAvailable()) setDenied(true);
      else toast.error(e?.message === 'permission_denied'
        ? 'Permiso denegado. Actívalo en los ajustes del navegador.'
        : 'No se pudieron activar las notificaciones');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      await sendTestPush();
      toast.success('Notificación de prueba enviada');
    } catch {
      toast.error('No se pudo enviar la prueba');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Notificaciones 🔔">
      {support === 'needs-install' ? (
        <p style={{ color: MPL.muted, fontSize: 13.5, margin: 0 }}>
          Para recibir notificaciones en tu iPhone, primero instala MyPetLive: abre esta web en Safari,
          toca <strong>Compartir</strong> y elige <strong>“Añadir a pantalla de inicio”</strong>. Luego
          abre la app desde el icono y vuelve aquí.
        </p>
      ) : support === 'unsupported' ? (
        <p style={{ color: MPL.muted, fontSize: 13.5, margin: 0 }}>
          Este navegador no soporta notificaciones push.
        </p>
      ) : denied ? (
        <>
          <p style={{ color: MPL.muted, fontSize: 13.5, margin: 0 }}>
            Las notificaciones están desactivadas en tu iPhone. Ábrelo en Ajustes, entra en
            <strong> Notificaciones</strong> y activa <strong>Permitir notificaciones</strong>.
          </p>
          <button type="button" onClick={() => { void openNativeSettings().catch(() => toast.error('Ábrelo en Ajustes del iPhone › MyPetLive › Notificaciones.')); }}
            style={{ justifySelf: 'start', background: MPL.teal, color: '#fff', border: 0, borderRadius: 13, padding: '11px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
            Abrir Ajustes del iPhone
          </button>
        </>
      ) : (
        <>
          <p style={{ color: MPL.muted, fontSize: 13.5, margin: 0 }}>
            Recibe un aviso en este dispositivo de mensajes nuevos, citas y vacunas, adopciones,
            pedidos y si alguien encuentra a tu mascota.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={toggle} disabled={busy}
              style={{ background: enabled ? '#fff' : MPL.teal, color: enabled ? MPL.ink : '#fff', border: enabled ? `1.5px solid ${MPL.border}` : 0, borderRadius: 13, padding: '11px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer', opacity: busy ? .7 : 1 }}>
              {busy ? 'Un momento…' : enabled ? 'Desactivar' : 'Activar notificaciones'}
            </button>
            {enabled && (
              <button type="button" onClick={test} disabled={busy}
                style={{ background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 13, padding: '11px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer', color: MPL.ink, opacity: busy ? .7 : 1 }}>
                Enviar prueba
              </button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div style={{ display: 'grid', gap: 24, padding: 'clamp(14px, 4vw, 24px)', maxWidth: 720 }}>
      <header>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 32, fontWeight: 800, margin: 0 }}>Ajustes</h1>
      </header>
      <PushPanel />
    </div>
  );
}
