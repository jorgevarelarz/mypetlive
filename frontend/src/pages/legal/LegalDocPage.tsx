import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLegalDoc, LegalSlug } from '../../api/legal';

const TITLES: Record<string, string> = {
  terms: 'Términos y Condiciones',
  privacy: 'Política de Privacidad',
  'legal-notice': 'Aviso Legal',
  cookies: 'Política de Cookies',
};

const SLUGS = Object.keys(TITLES);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renderizador del subconjunto de Markdown que usamos en legal/*.md. Se escapa
 * PRIMERO todo el HTML y solo después se aplican las transformaciones, así que
 * el documento no puede inyectar marcado aunque alguien edite los textos desde
 * el panel de administración. No merece la pena una dependencia para esto.
 */
function renderMarkdown(md: string): string {
  const lines = escapeHtml(md).split('\n');
  const out: string[] = [];
  let inList = false;
  let inTable = false;

  const closeBlocks = () => {
    if (inList) { out.push('</ul>'); inList = false; }
    if (inTable) { out.push('</tbody></table>'); inTable = false; }
  };

  const inline = (t: string) =>
    t
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  for (const line of lines) {
    const t = line.trim();

    if (!t) { closeBlocks(); continue; }

    const heading = /^(#{1,4})\s+(.*)$/.exec(t);
    if (heading) {
      closeBlocks();
      const level = Math.min(heading[1].length + 1, 5); // # → h2, para no duplicar el h1
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    // Separador de cabecera de tabla: |---|---|
    if (/^\|[\s:|-]+\|$/.test(t)) continue;

    if (t.startsWith('|') && t.endsWith('|')) {
      const cells = t.slice(1, -1).split('|').map(c => inline(c.trim()));
      if (!inTable) {
        out.push('<table><thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>');
        inTable = true;
      } else {
        out.push('<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>');
      }
      continue;
    }

    if (/^[-*]\s+/.test(t)) {
      if (inTable) { out.push('</tbody></table>'); inTable = false; }
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(t.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }

    closeBlocks();
    out.push(`<p>${inline(t)}</p>`);
  }

  closeBlocks();
  return out.join('\n');
}

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
