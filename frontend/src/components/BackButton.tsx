import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

// En la app no hay botón «atrás» de navegador: las pantallas que van fuera del
// AppShell (sin barra inferior) necesitan este para poder salir. Si se entró
// directo (enlace, QR), no hay historial y vuelve al inicio.
export default function BackButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const nav = useNavigate();
  const back = () => {
    if ((window.history.state?.idx ?? 0) > 0) nav(-1);
    else nav('/', { replace: true });
  };
  return (
    <button
      type="button"
      onClick={back}
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        background: 'none', border: 'none', padding: '8px 4px', cursor: 'pointer',
        font: 'inherit', fontSize: 15, fontWeight: 700, color: 'inherit',
        ...style,
      }}
    >
      <ChevronLeft size={20} aria-hidden="true" />
      Volver
    </button>
  );
}
