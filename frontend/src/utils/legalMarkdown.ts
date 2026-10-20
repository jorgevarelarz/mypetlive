// Renderizador del subconjunto de Markdown de legal/*.md, compartido por la
// página pública de cada documento y la pantalla de aceptación.
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
export function renderMarkdown(md: string): string {
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
