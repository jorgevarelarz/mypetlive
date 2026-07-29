import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { confirmEmailChange } from '../../api/users';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

// Página a la que apunta el enlace del correo de confirmación. Se abre desde el
// buzón nuevo, donde puede no haber sesión iniciada: no va dentro de
// ProtectedRoute, el token del enlace es la credencial.
export default function ConfirmEmailChange() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  // En desarrollo React monta dos veces; sin esto el token se gastaría en la
  // primera pasada y la segunda mostraría un error falso.
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    if (!token) {
      setState('error');
      setMessage('Este enlace no lleva ningún código de confirmación. Ábrelo tal cual viene en el correo.');
      return;
    }

    confirmEmailChange(token)
      .then(res => {
        setEmail(res.email);
        setState('ok');
      })
      .catch(err => {
        const code = err?.response?.data?.error;
        setMessage(
          code === 'email_taken'
            ? 'Esa dirección ya la está usando otra cuenta, así que no hemos podido asignártela.'
            : 'Este enlace ya no vale: puede que haya caducado, que ya lo hayas usado o que hayas pedido otro cambio después. Vuelve a pedir el cambio desde tu perfil.',
        );
        setState('error');
      });
  }, [token]);

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink, background: MPL.bg, minHeight: '100vh', padding: '48px 20px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: '30px 26px' }}>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, margin: '0 0 14px' }}>
          {state === 'loading' ? 'Confirmando…' : state === 'ok' ? 'Correo confirmado' : 'No hemos podido confirmarlo'}
        </h1>

        {state === 'loading' && (
          <p style={{ margin: 0, color: MPL.muted }}>Un momento, estamos comprobando el enlace.</p>
        )}

        {state === 'ok' && (
          <>
            <p style={{ margin: '0 0 10px' }}>
              Ya puedes entrar en MyPetLive con <strong>{email}</strong>.
            </p>
            <p style={{ margin: '0 0 18px', color: MPL.muted, fontSize: 14 }}>
              La dirección anterior deja de servir para iniciar sesión.
            </p>
            <Link to="/login" style={{ display: 'inline-block', background: MPL.teal, color: '#fff', textDecoration: 'none', fontWeight: 800, borderRadius: 12, padding: '11px 18px' }}>
              Ir a iniciar sesión
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <p style={{ margin: '0 0 18px' }}>{message}</p>
            <Link to="/profile" style={{ display: 'inline-block', background: MPL.teal, color: '#fff', textDecoration: 'none', fontWeight: 800, borderRadius: 12, padding: '11px 18px' }}>
              Ir a mi perfil
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
