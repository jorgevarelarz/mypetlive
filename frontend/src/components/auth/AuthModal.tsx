import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthModal } from '../../context/AuthModalContext';

/**
 * Antes era una ventana emergente propia para entrar o crear cuenta, con otro
 * diseño que las pantallas /login y /register y sin Apple, Google ni la casilla
 * de legales. Ahora `openAuth()` lleva a esas pantallas (una sola forma de
 * entrar en toda la web y la app) y, al terminar, se vuelve a donde se estaba.
 * El mensaje de quien la abre («Entra para canjear el cupón…») viaja en el
 * state de la navegación y lo enseña la pantalla.
 */
export default function AuthModal() {
  const { open, mode, message, closeAuth } = useAuthModal();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!open) return;
    const here = loc.pathname + loc.search;
    const target = mode === 'login' ? '/login' : '/register';
    const onAuthPage = loc.pathname === '/login' || loc.pathname === '/register';
    const query = here !== '/' && !onAuthPage ? `?redirect=${encodeURIComponent(here)}` : '';
    closeAuth();
    nav(`${target}${query}`, { state: message ? { message } : undefined });
  }, [open, mode, message, closeAuth, nav, loc.pathname, loc.search]);

  return null;
}
