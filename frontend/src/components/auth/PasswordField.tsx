import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Campo de contraseña con el ojo para verla, como en cualquier web.
 *
 * Existe como componente y no copiado en cada formulario porque son CUATRO
 * pantallas (el modal de acceso, /login, /register y /reset) y la contraseña
 * mínima son 12 caracteres: escribirla a ciegas cuatro veces seguidas es donde
 * la gente se equivoca, se cansa y se va — o acaba abriéndose una segunda
 * cuenta, que es justo lo que se ve en la base de datos.
 *
 * Detalles que no se ven pero rompen si faltan:
 *
 *  - `type="button"` en el botón. Dentro de un `<form>`, un `<button>` sin tipo
 *    es `submit`: pulsar el ojo enviaría el formulario a medio escribir.
 *  - El campo sigue siendo `password` mientras no se pulsa, así que los gestores
 *    de contraseñas lo reconocen igual; `autoComplete` lo decide quien lo usa
 *    (`new-password` al registrarse, `current-password` al entrar).
 *  - `tabIndex={-1}`: el ojo se queda fuera del tabulador. Quien navega con
 *    teclado va del campo al botón de enviar, que es lo que quiere hacer; el
 *    ojo se pulsa con el ratón o con el lector de pantalla, que sí lo ve.
 *  - Se le reserva sitio con `paddingRight` en vez de superponerlo: si no, el
 *    icono se come la última letra de una contraseña larga.
 */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

export default function PasswordField({ style, ...props }: Props) {
  const [visible, setVisible] = React.useState(false);
  const etiqueta = visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña';

  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        style={{ ...style, width: '100%', paddingRight: 42 }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={etiqueta}
        aria-pressed={visible}
        title={etiqueta}
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          background: 'none',
          border: 0,
          padding: 4,
          cursor: 'pointer',
          color: '#7A8273',
          lineHeight: 0,
        }}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}
