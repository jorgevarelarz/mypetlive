import { useEffect } from 'react';

const DEFAULT_TITLE = 'MyPetLive — Adopción responsable';

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Fija título y meta (description + Open Graph) por página en cliente.
 * Útil para UX (pestaña), buscadores que ejecutan JS (Google) y como
 * complemento al render OG para bots sociales (que hace el backend).
 */
export function usePageMeta({
  title,
  description,
  image,
}: {
  title?: string;
  description?: string;
  image?: string;
}) {
  useEffect(() => {
    if (title) {
      document.title = title;
      upsertMeta('property', 'og:title', title);
    }
    if (description) {
      upsertMeta('name', 'description', description);
      upsertMeta('property', 'og:description', description);
    }
    if (image) upsertMeta('property', 'og:image', image);

    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title, description, image]);
}
