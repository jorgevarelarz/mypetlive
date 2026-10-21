import React, { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

// En la app no hay botón «atrás» de navegador: las pantallas que van fuera del
// AppShell (sin barra inferior) necesitan este para poder salir. Si se entró
// directo (enlace, QR), no hay historial y vuelve al inicio.
export function useGoBack() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  return useCallback(() => {
    if ((window.history.state?.idx ?? 0) > 0) nav(-1);
    else if (pathname !== '/') nav('/', { replace: true });
  }, [nav, pathname]);
}

/**
 * Gesto de deslizar desde el borde izquierdo en la app de iPhone: la parte
 * nativa (MainViewController) dispara «nativeback» y aquí se vuelve igual que
 * con el botón. Se monta una vez, dentro del router.
 */
export function NativeBackListener() {
  const goBack = useGoBack();
  const { pathname } = useLocation();
  // En la app el contenido se desplaza dentro de #root (index.css): al cambiar
  // de pantalla se vuelve arriba, como en cualquier app.
  useEffect(() => {
    if (document.documentElement.classList.contains('native-app')) {
      document.getElementById('root')?.scrollTo(0, 0);
    }
  }, [pathname]);
  useEffect(() => {
    window.addEventListener('nativeback', goBack);
    return () => window.removeEventListener('nativeback', goBack);
  }, [goBack]);
  return null;
}

export default function BackButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const back = useGoBack();
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
