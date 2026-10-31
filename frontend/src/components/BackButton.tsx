import React, { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { MPL } from '../styles/mypetlive';

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

const EDGE = 28;       // px desde el borde izquierdo donde puede empezar el gesto
const THRESHOLD = 90;  // px que hay que arrastrar para que vuelva
const BUBBLE = 44;

/**
 * Gesto de deslizar desde el borde izquierdo en la app de iPhone: vuelve igual
 * que el botón. Se detecta en la web con eventos táctiles; el reconocedor
 * nativo (UIScreenEdgePanGestureRecognizer) nunca llegaba a dispararse desde
 * que el contenido se desplaza dentro de #root. Mientras se arrastra, una
 * burbuja con la flecha sigue al dedo. Se monta una vez, dentro del router.
 */
export function NativeBackListener() {
  const goBack = useGoBack();
  const { pathname } = useLocation();
  const latest = useRef({ goBack, pathname });
  latest.current = { goBack, pathname };
  // En la app el contenido se desplaza dentro de #root (index.css): al cambiar
  // de pantalla se vuelve arriba, como en cualquier app.
  useEffect(() => {
    if (document.documentElement.classList.contains('native-app')) {
      document.getElementById('root')?.scrollTo(0, 0);
    }
  }, [pathname]);
  useEffect(() => {
    if (!document.documentElement.classList.contains('native-app')) return;
    const bubble = document.createElement('div');
    bubble.setAttribute('aria-hidden', 'true');
    bubble.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
    Object.assign(bubble.style, {
      position: 'fixed', left: `${-BUBBLE}px`, top: '0', width: `${BUBBLE}px`, height: `${BUBBLE}px`, zIndex: '9999',
      borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#fff', color: MPL.ink, boxShadow: '0 4px 14px rgba(0,0,0,.18)',
      pointerEvents: 'none', opacity: '0', transform: 'translateX(0)',
    });
    document.body.appendChild(bubble);

    let startX = 0, startY = 0, dx = 0;
    let state: 'idle' | 'maybe' | 'drag' = 'idle';
    const canGoBack = () => (window.history.state?.idx ?? 0) > 0 || latest.current.pathname !== '/';
    const paint = () => {
      const progress = Math.min(dx / THRESHOLD, 1);
      const ready = dx >= THRESHOLD;
      bubble.style.transform = `translateX(${Math.min(dx, THRESHOLD) * 0.9}px)`;
      bubble.style.opacity = String(progress);
      bubble.style.background = ready ? MPL.teal : '#fff';
      bubble.style.color = ready ? '#fff' : MPL.ink;
    };
    const hide = () => {
      bubble.style.transition = 'transform .18s ease, opacity .18s ease';
      bubble.style.transform = 'translateX(0)';
      bubble.style.opacity = '0';
    };

    const onStart = (e: TouchEvent) => {
      state = 'idle';
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX > EDGE || !canGoBack()) return;
      startX = t.clientX; startY = t.clientY; dx = 0;
      state = 'maybe';
    };
    const onMove = (e: TouchEvent) => {
      if (state === 'idle') return;
      const t = e.touches[0];
      const mx = t.clientX - startX;
      const my = t.clientY - startY;
      if (state === 'maybe') {
        // Si el dedo va más en vertical que en horizontal es un desplazamiento normal.
        if (Math.abs(my) > 10 && Math.abs(my) > mx) { state = 'idle'; return; }
        if (mx < 10) return;
        state = 'drag';
        bubble.style.transition = 'none';
        bubble.style.top = `${Math.max(t.clientY - BUBBLE / 2, 60)}px`;
      }
      e.preventDefault();
      dx = Math.max(mx, 0);
      paint();
    };
    const onEnd = () => {
      if (state === 'drag') {
        if (dx >= THRESHOLD) latest.current.goBack();
        hide();
      }
      state = 'idle';
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      bubble.remove();
    };
  }, []);
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
