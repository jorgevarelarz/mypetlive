import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// La cabecera pública es sticky: sin este margen la sección aterriza debajo.
const HEADER_OFFSET = 76;
// Margen de error en px por debajo del cual ya no merece la pena recolocar.
const TOLERANCE = 4;
// Cuánto seguimos vigilando que la sección no se mueva (imágenes, datos de API).
const SETTLE_MS = 2500;
const TICK_MS = 100;

/**
 * React Router no hace scroll al ancla (`/#impacto`) por su cuenta: navega y
 * deja la página donde estaba. Este componente lo hace a mano.
 *
 * Además vigila la sección un par de segundos: en la landing las estadísticas y
 * las fotos llegan después del primer render y empujan el layout, así que un
 * único scroll deja la sección descolocada.
 */
export default function HashScroll() {
  const { hash, key } = useLocation();

  useEffect(() => {
    const id = decodeURIComponent(hash.replace('#', ''));
    if (!id) return;

    let cancelled = false;
    let scrolledOnce = false;
    let elapsed = 0;
    let lastY = -1;

    // Si el usuario toma el control, dejamos de recolocar la página bajo sus pies.
    const cancel = () => {
      cancelled = true;
    };
    const events = ['wheel', 'touchstart', 'keydown'] as const;
    events.forEach((e) => window.addEventListener(e, cancel, { passive: true }));

    const tick = () => {
      if (cancelled) return;

      // Si la página sigue moviéndose es que el scroll suave no ha terminado:
      // corregir ahora lo cortaría en seco.
      const y = window.scrollY;
      const atRest = y === lastY;
      lastY = y;

      const el = document.getElementById(id);
      if (el && (!scrolledOnce || atRest)) {
        const delta = el.getBoundingClientRect().top - HEADER_OFFSET;
        if (Math.abs(delta) > TOLERANCE) {
          window.scrollTo({
            top: y + delta,
            // El primer salto es largo y se agradece suave; las correcciones
            // posteriores son pequeñas y en smooth se pisarían entre ellas.
            behavior: scrolledOnce ? 'auto' : 'smooth',
          });
          scrolledOnce = true;
          lastY = -1;
        }
      }

      elapsed += TICK_MS;
      if (elapsed < SETTLE_MS) window.setTimeout(tick, TICK_MS);
    };
    tick();

    return () => {
      cancelled = true;
      events.forEach((e) => window.removeEventListener(e, cancel));
    };
  }, [hash, key]);

  return null;
}
