import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { isNativeApp } from '../utils/native';

// Enlaces universales de iOS: cuando alguien con la app instalada toca un enlace
// de mypetlive.es que la app reclama (ver public/.well-known/apple-app-site-association,
// hoy solo /compartir/*), iOS abre la app en vez de Safari y avisa con
// `appUrlOpen`. Aquí se lleva a esa misma pantalla dentro de la app.
const HOSTS = new Set(['mypetlive.es', 'www.mypetlive.es']);

export default function NativeLinkListener() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNativeApp()) return undefined;
    const handle = App.addListener('appUrlOpen', ({ url }) => {
      try {
        const u = new URL(url);
        if (!HOSTS.has(u.hostname)) return;
        navigate(`${u.pathname}${u.search}${u.hash}`);
      } catch {
        // URL rara: mejor quedarse donde está que romper la app.
      }
    });
    return () => { void handle.then(h => h.remove()); };
  }, [navigate]);
  return null;
}
