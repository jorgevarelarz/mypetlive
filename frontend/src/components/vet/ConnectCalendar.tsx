import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { CalendarPlus, Copy, RefreshCw, X } from 'lucide-react';
import { getVetCalendarFeed, rotateVetCalendarFeed } from '../../api/vetAppointments';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

// "Conectar calendario": el vet suscribe el calendario que ya usa (Google, Apple,
// Outlook…) al feed iCal de sus citas. Al elegir proveedor se abre su flujo nativo
// de suscripción (le pide iniciar sesión ahí si no la tiene) y desde entonces el
// proveedor sincroniza solo. Regenerar el enlace invalida el anterior.
export default function ConnectCalendar() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const feedQ = useQuery({ queryKey: ['vet-calendar-feed'], queryFn: getVetCalendarFeed, enabled: open });
  const url = feedQ.data?.url;
  const webcal = url?.replace(/^https?/, 'webcal');

  const rotate = useMutation({
    mutationFn: rotateVetCalendarFeed,
    onSuccess: data => {
      queryClient.setQueryData(['vet-calendar-feed'], data);
      toast.success('Enlace regenerado: el anterior deja de funcionar');
    },
    onError: () => toast.error('No se pudo regenerar el enlace'),
  });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado');
    } catch {
      window.prompt('Copia el enlace del calendario:', url);
    }
  };

  const providers = webcal
    ? [
        {
          name: 'Google Calendar',
          hint: 'Se abre Google y te pide iniciar sesión si no la tienes',
          emoji: '🗓️',
          href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
        },
        {
          name: 'Apple Calendar',
          hint: 'Se abre la app Calendario de tu Mac o iPhone',
          emoji: '🍎',
          href: webcal,
        },
        {
          name: 'Outlook',
          hint: 'Se abre Outlook y te pide iniciar sesión si no la tienes',
          emoji: '📧',
          href: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(webcal)}&name=${encodeURIComponent('MyPetLive')}`,
        },
      ]
    : [];

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
    border: `1.5px solid ${MPL.border}`, borderRadius: 12, background: '#fff',
    color: MPL.ink, textDecoration: 'none', cursor: 'pointer', font: 'inherit', width: '100%', textAlign: 'left',
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px',
          border: 'none', borderRadius: 999, background: MPL.teal, color: '#fff',
          font: 'inherit', fontWeight: 700, cursor: 'pointer',
        }}
      >
        <CalendarPlus size={17} /> Conectar calendario
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(63,74,60,0.45)', zIndex: 60,
            display: 'grid', placeItems: 'center', padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: MPL.bg, borderRadius: 18, padding: 22, width: 'min(440px, 100%)', display: 'grid', gap: 14 }}
          >
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800, margin: 0 }}>Conectar calendario</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: MPL.muted, padding: 4 }}>
                <X size={19} />
              </button>
            </header>

            <p style={{ color: MPL.muted, margin: 0, fontSize: 14 }}>
              Elige el calendario que usas: se conecta una vez y tus citas de MyPetLive
              (con sus cambios y cancelaciones) aparecerán ahí automáticamente.
            </p>

            {feedQ.isLoading && <p style={{ color: MPL.muted, margin: 0 }}>Preparando tu enlace…</p>}
            {feedQ.isError && <p style={{ color: MPL.coralDark, margin: 0 }}>No se pudo cargar el enlace. Cierra y vuelve a intentarlo.</p>}

            {url && (
              <>
                <div style={{ display: 'grid', gap: 8 }}>
                  {providers.map(p => (
                    <a key={p.name} href={p.href} target={p.href.startsWith('webcal') ? undefined : '_blank'} rel="noreferrer" style={rowStyle}>
                      <span style={{ fontSize: 20 }}>{p.emoji}</span>
                      <span style={{ display: 'grid' }}>
                        <strong>{p.name}</strong>
                        <small style={{ color: MPL.muted }}>{p.hint}</small>
                      </span>
                    </a>
                  ))}
                  <button type="button" onClick={copy} style={rowStyle}>
                    <span style={{ fontSize: 20 }}><Copy size={18} /></span>
                    <span style={{ display: 'grid' }}>
                      <strong>Copiar enlace (otros calendarios)</strong>
                      <small style={{ color: MPL.muted }}>Pégalo en cualquier app que acepte calendarios por URL</small>
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('¿Regenerar el enlace? Los calendarios ya conectados dejarán de sincronizar y tendrás que volver a conectarlos.')) {
                      rotate.mutate();
                    }
                  }}
                  disabled={rotate.isPending}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, justifySelf: 'start',
                    border: 'none', background: 'transparent', color: MPL.muted, cursor: 'pointer',
                    font: 'inherit', fontSize: 13, padding: 0,
                  }}
                >
                  <RefreshCw size={13} /> Regenerar enlace (si lo has compartido por error)
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
