import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 1600;

// easeOutExpo: arranca rápido y frena al final, que es lo que hace que un
// contador parezca que "aterriza" en su cifra en vez de cortarse en seco.
const ease = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

// A mano y no con `toLocaleString('es-ES')`: el español de CLDR NO agrupa los
// números de cuatro dígitos, y dejaba "1247" donde el diseño pone "1.247".
const groupThousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

type Props = {
  /** Cifra final. Se cuenta con enteros: el formato lo pone `toLocaleString`. */
  to: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
};

/**
 * Número que sube desde 0 la primera vez que entra en pantalla.
 *
 * No arranca al montar a propósito: la sección de impacto está muy abajo en la
 * landing, y si contase al cargar el usuario llegaría siempre a números quietos.
 */
export default function CountUp({ to, prefix = '', suffix = '', durationMs = DURATION_MS }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setValue(to);
      return;
    }

    let raf = 0;
    let start = 0;

    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min((now - start) / durationMs, 1);
      setValue(Math.round(to * ease(t)));
      if (t < 1) raf = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect(); // una sola vez: repetir al hacer scroll arriba y abajo marea
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, durationMs]);

  return (
    // tabular-nums: sin esto el número baila de ancho a cada frame, porque los
    // dígitos de la tipografía de display no miden lo mismo.
    <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}
      {groupThousands(value)}
      {suffix}
    </span>
  );
}
