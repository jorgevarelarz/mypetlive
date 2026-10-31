import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { getDeletionCheck, deleteMyAccount, DeletionBlocker } from '../../api/auth';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

// Qué tiene que cerrar la persona antes de poder borrar la cuenta.
const BLOCKER_TEXT: Record<DeletionBlocker, string> = {
  open_vet_appointments: 'Tienes citas veterinarias pendientes. Cancélalas o espera a que terminen.',
  locked_patitas: 'Tienes Patitas reservadas para una cita. Se liberan al cancelarla o completarla.',
  patitas_balance: 'Tu protectora todavía tiene Patitas. Escríbenos y te ayudamos a canjearlas.',
  pending_payouts: 'Tienes liquidaciones de Patitas pendientes de cobro.',
  open_orders_as_seller: 'Tienes pedidos de tu tienda sin entregar.',
  open_orders_as_buyer: 'Tienes pedidos en camino. Podrás borrar la cuenta cuando lleguen.',
  open_adoptions_as_shelter: 'Hay adopciones en curso de tus animales. Ciérralas antes de irte.',
  admin_account: 'Las cuentas de administración no se borran desde aquí.',
};

const inputStyle: React.CSSProperties = {
  border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 13px', font: 'inherit', fontSize: 15, width: '100%', boxSizing: 'border-box',
};

// En el perfil se ve solo el botón: la explicación y la confirmación salen en
// un diálogo al pulsarlo. `startOpen` es para quien ya ha pedido borrar en otra
// parte (el consentimiento legal) y no tiene que volver a pulsar.
export default function DeleteAccountPanel({ startOpen = false, onClose }: { startOpen?: boolean; onClose?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(startOpen);
  const [step, setStep] = useState<'idle' | 'checking' | 'confirm' | 'deleting'>('idle');
  const [blockers, setBlockers] = useState<DeletionBlocker[]>([]);
  const [confirmWith, setConfirmWith] = useState<'password' | 'email'>('password');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');

  const start = async () => {
    setStep('checking');
    setError('');
    try {
      const check = await getDeletionCheck();
      setBlockers(check.blockers);
      setConfirmWith(check.confirmWith);
      setStep('confirm');
    } catch {
      setError('No hemos podido comprobar tu cuenta. Inténtalo de nuevo.');
      setStep('idle');
    }
  };

  // La comprobación sale sola al abrir: así el diálogo ya enseña o lo que
  // falta por cerrar o el campo para confirmar, sin un segundo botón.
  useEffect(() => {
    if (open) void start();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (step === 'deleting') return;
    setOpen(false);
    setStep('idle');
    setSecret('');
    setError('');
    setBlockers([]);
    onClose?.();
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('deleting');
    setError('');
    try {
      await deleteMyAccount(confirmWith === 'password' ? { password: secret } : { confirmEmail: secret });
      logout();
      toast.success('Tu cuenta se ha eliminado');
      navigate('/', { replace: true });
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.error === 'account_has_pending') setBlockers(data.blockers || []);
      setError(
        data?.error === 'invalid_password' ? 'La contraseña no es correcta.'
          : data?.error === 'email_mismatch' ? 'El correo no coincide con el de tu cuenta.'
            : data?.error === 'account_has_pending' ? ''
              : data?.code === 'too_many_attempts' ? 'Demasiados intentos. Espera unos minutos.'
                : 'No hemos podido borrar la cuenta. Inténtalo de nuevo.',
      );
      setStep('confirm');
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        style={{ justifySelf: 'start', background: '#fff', color: MPL.coralDark, border: `1.5px solid ${MPL.coralDark}`, borderRadius: 13, padding: '11px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
        Borrar mi cuenta
      </button>
      {open && createPortal(
        // Portal a <body>: dentro de la app el contenido se desplaza en #root.
        <div className="safe-top fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="w-full max-w-md bg-white"
            onClick={e => e.stopPropagation()}
            style={{ borderRadius: '24px 24px 0 0', padding: '24px 22px calc(22px + env(safe-area-inset-bottom))', display: 'grid', gap: 12 }}
          >
            <h2 id="delete-account-title" style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, fontWeight: 800, margin: 0 }}>¿Borrar tu cuenta?</h2>
            <p style={{ color: MPL.muted, fontSize: 13.5, margin: 0 }}>
              Se borrarán tu perfil, tus datos personales, tus favoritos, tus alertas y tus solicitudes de adopción abiertas.
              Tus mascotas dejarán de estar a tu nombre y perderás tus Patitas. Guardamos sin tu nombre lo que la ley nos
              obliga a conservar (pedidos, donaciones y aceptaciones legales). No se puede deshacer.
            </p>

            {step === 'idle' || step === 'checking' ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {step === 'checking'
                  ? <span style={{ color: MPL.faint, fontSize: 13.5 }}>Comprobando tu cuenta…</span>
                  : <button type="button" onClick={start} style={{ background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 13, padding: '11px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer', color: MPL.ink }}>Reintentar</button>}
                <button type="button" onClick={close}
                  style={{ background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 13, padding: '11px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer', color: MPL.ink }}>
                  Cancelar
                </button>
              </div>
            ) : blockers.length > 0 ? (
              <div role="alert" style={{ display: 'grid', gap: 8 }}>
                <strong style={{ fontSize: 14 }}>Antes hay que cerrar esto:</strong>
                <ul style={{ margin: 0, paddingLeft: 18, color: MPL.ink, fontSize: 13.5, display: 'grid', gap: 4 }}>
                  {blockers.map(b => <li key={b}>{BLOCKER_TEXT[b] || b}</li>)}
                </ul>
                <p style={{ color: MPL.muted, fontSize: 13, margin: 0 }}>
                  ¿Necesitas ayuda? Escríbenos a <a href="mailto:soporte@mypetlive.es">soporte@mypetlive.es</a>.
                </p>
                <button type="button" onClick={close}
                  style={{ justifySelf: 'start', background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 13, padding: '11px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer', color: MPL.ink }}>
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={confirm} style={{ display: 'grid', gap: 10 }}>
                <label style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {confirmWith === 'password'
                    ? 'Para confirmar, escribe tu contraseña'
                    : `Para confirmar, escribe tu correo (${user?.email})`}
                  <input
                    type={confirmWith === 'password' ? 'password' : 'email'}
                    autoComplete={confirmWith === 'password' ? 'current-password' : 'off'}
                    value={secret} onChange={e => setSecret(e.target.value)} required
                    style={{ ...inputStyle, marginTop: 6 }}
                  />
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="submit" disabled={step === 'deleting' || !secret}
                    style={{ background: MPL.coralDark, color: '#fff', border: 0, borderRadius: 13, padding: '11px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer', opacity: step === 'deleting' || !secret ? .7 : 1 }}>
                    {step === 'deleting' ? 'Borrando…' : 'Confirmar y borrar'}
                  </button>
                  <button type="button" onClick={close} disabled={step === 'deleting'}
                    style={{ background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 13, padding: '11px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer', color: MPL.ink }}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
            {error && <p role="alert" style={{ color: MPL.coralDark, fontSize: 13.5, margin: 0 }}>{error}</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
