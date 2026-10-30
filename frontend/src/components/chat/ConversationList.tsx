import React from 'react';
import { Link } from 'react-router-dom';
import type { ConversationSummary } from '../../api/chat';
import { MPL } from '../../styles/mypetlive';
import { toAbsoluteUrl } from '../../utils/media';
import { adoptionPill, listTime, previewOf, VET_PILL } from './chatFormat';

/** Foto del animal (o inicial) con la marca de quién es la otra parte: P protectora, V veterinario. */
export function ConversationAvatar({ conv, size = 52 }: { conv: ConversationSummary; size?: number }) {
  const photo = conv.animal?.photo ? toAbsoluteUrl(conv.animal.photo) : undefined;
  const initial = (conv.animal?.name || conv.other.name || '?').trim()[0]?.toUpperCase();
  const tag = conv.other.role === 'landlord' ? 'P' : conv.other.role === 'vet' ? 'V' : null;
  const radius = Math.round(size * 0.31);
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <div style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', background: MPL.panel, display: 'grid', placeItems: 'center', color: MPL.tealDark, fontWeight: 800, fontSize: size * 0.4 }}>
        {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
      </div>
      {tag && (
        <span aria-hidden="true" style={{ position: 'absolute', right: -4, bottom: -4, width: Math.round(size * 0.44), height: Math.round(size * 0.44), borderRadius: 8, border: '2.5px solid #fff', background: tag === 'P' ? MPL.teal : MPL.coral, color: '#fff', fontSize: Math.round(size * 0.22), fontWeight: 800, display: 'grid', placeItems: 'center' }}>
          {tag}
        </span>
      )}
    </div>
  );
}

/** «Solicitud por Luna», «Quiere adoptar a Luna», «Cita de Toby · mar 4 nov». */
export function contextLine(conv: ConversationSummary): string {
  const name = conv.animal?.name;
  const ctx = conv.context;
  if (ctx.type === 'adoption') {
    if (!name) return 'Solicitud de adopción';
    return ctx.role === 'shelter' ? `Quiere adoptar a ${name}` : `Solicitud por ${name}`;
  }
  const when = ctx.at
    ? new Date(ctx.at).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short' })
    : '';
  return `${name ? `Cita de ${name}` : ctx.service || 'Cita veterinaria'}${when ? ` · ${when}` : ''}`;
}

export function statusPillOf(conv: ConversationSummary) {
  return conv.context.type === 'adoption' ? adoptionPill(conv.context.status) : VET_PILL[conv.context.status || ''] || null;
}

export default function ConversationList({
  items,
  selectedId,
  filter,
}: {
  items: ConversationSummary[];
  selectedId?: string;
  filter: 'all' | 'unread';
}) {
  const shown = filter === 'unread' ? items.filter(c => c.unreadForMe > 0) : items;
  if (!shown.length) {
    return (
      <div style={{ padding: '26px 12px', textAlign: 'center', color: MPL.muted, fontSize: 14.5 }}>
        {filter === 'unread' ? 'Lo tienes todo leído.' : 'Aún no tienes conversaciones.'}
      </div>
    );
  }
  return (
    <div className="mpl-conv-list">
      {shown.map(conv => {
        const unread = conv.unreadForMe > 0;
        const pill = statusPillOf(conv);
        const selected = conv._id === selectedId;
        return (
          <Link
            key={conv._id}
            to={`/mensajes/${conv._id}`}
            className={`mpl-conv${unread ? ' is-unread' : ''}${selected ? ' is-selected' : ''}`}
            aria-current={selected ? 'page' : undefined}
          >
            <ConversationAvatar conv={conv} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="mpl-conv-name">{conv.other.name}</span>
                <span className="mpl-conv-time">{listTime(conv.lastMessage?.createdAt || conv.lastMessageAt)}</span>
              </div>
              <div className="mpl-conv-ctx">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{contextLine(conv)}</span>
                {pill && <span className="mpl-pill" style={{ background: pill.bg, color: pill.color }}>{pill.label}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mpl-conv-last">{previewOf(conv.lastMessage)}</span>
                {unread && <span className="mpl-badge" aria-label={`${conv.unreadForMe} sin leer`}>{conv.unreadForMe}</span>}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
