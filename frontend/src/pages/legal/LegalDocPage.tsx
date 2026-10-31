import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLegalDoc, LegalSlug } from '../../api/legal';
import { renderMarkdown } from '../../utils/legalMarkdown';

const TITLES: Record<string, string> = {
  terms: 'Términos y Condiciones',
  privacy: 'Política de Privacidad',
  'legal-notice': 'Aviso Legal',
  cookies: 'Política de Cookies',
};

const SLUGS = Object.keys(TITLES);

export default function LegalDocPage() {
  const { slug = '' } = useParams();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);

    if (!SLUGS.includes(slug)) {
      setError('Este documento no existe.');
      return;
    }

    getLegalDoc(slug as LegalSlug)
      .then(doc => { if (!cancelled) setHtml(renderMarkdown(doc.content)); })
      .catch(() => { if (!cancelled) setError('No hemos podido cargar el documento. Inténtalo de nuevo en unos minutos.'); });

    return () => { cancelled = true; };
  }, [slug]);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px 64px' }}>
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 28, fontSize: 14 }}>
        {SLUGS.map(s => (
          <Link
            key={s}
            to={`/legal/${s}`}
            style={{ fontWeight: s === slug ? 700 : 400, textDecoration: s === slug ? 'none' : 'underline' }}
          >
            {TITLES[s]}
          </Link>
        ))}
      </nav>

      <h1 style={{ marginTop: 0 }}>{TITLES[slug] || 'Documento legal'}</h1>

      {error && <p role="alert">{error}</p>}
      {!error && !html && <p>Cargando…</p>}
      {html && (
        <div
          className="legal-doc"
          style={{ lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}

      <style>{`
        .legal-doc h2 { margin-top: 32px; font-size: 22px; }
        .legal-doc h3 { margin-top: 24px; font-size: 18px; }
        .legal-doc table { border-collapse: collapse; width: 100%; margin: 16px 0; display: block; overflow-x: auto; }
        .legal-doc th, .legal-doc td { border: 1px solid var(--border, #ddd); padding: 8px 10px; text-align: left; font-size: 14px; }
        .legal-doc li { margin-bottom: 6px; }
      `}</style>
    </div>
  );
}
