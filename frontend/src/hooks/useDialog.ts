import { useEffect, useRef } from 'react';

// Lo que implica role="dialog" + aria-modal (AUD-2): el foco entra en el diálogo
// y no se escapa con Tab, Escape lo cierra, al cerrar vuelve al botón que lo abrió
// y el resto de la página queda inerte para el teclado y el lector de pantalla.
const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const cerrar = useRef(onClose);
  cerrar.current = onClose;

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const nodo = ref.current;
    // Todo lo que no es el diálogo (el portal cuelga de <body>) queda inerte.
    const hermanos = Array.from(document.body.children).filter(el => nodo && !el.contains(nodo)) as HTMLElement[];
    const antes = hermanos.map(el => [el, el.hasAttribute('inert'), el.getAttribute('aria-hidden')] as const);
    hermanos.forEach(el => { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); });
    const primero = nodo?.querySelector<HTMLElement>(ENFOCABLES);
    (primero || nodo)?.focus();

    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cerrar.current(); return; }
      if (e.key !== 'Tab' || !nodo) return;
      const lista = Array.from(nodo.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(el => el.offsetParent !== null);
      if (!lista.length) return;
      const [a, z] = [lista[0], lista[lista.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      antes.forEach(([el, inerte, oculto]) => {
        if (!inerte) el.removeAttribute('inert');
        if (oculto === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', oculto);
      });
      previo?.focus?.();
    };
  }, []);

  return ref;
}
