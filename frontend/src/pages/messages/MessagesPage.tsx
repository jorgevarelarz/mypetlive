import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listConversations } from '../../api/chat';
import ConversationList from '../../components/chat/ConversationList';
import ChatThread from '../../components/chat/ChatThread';
import { useAuth } from '../../context/AuthContext';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import './messages.css';

/**
 * Mensajes: bandeja y conversación. En escritorio, lado a lado; en el móvil,
 * la bandeja y, al abrir una, la conversación a pantalla completa (tapa la
 * cabecera y la barra de abajo, como cualquier app de mensajería).
 */
const NARROW = '(max-width: 899px)';

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

export default function MessagesPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const narrow = useNarrow();
  const listQ = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: () => listConversations({ limit: 50 }),
    refetchInterval: 15_000,
  });
  const items = listQ.data || [];
  const unread = items.filter(c => c.unreadForMe > 0).length;
  const sub = user?.role === 'landlord'
    ? 'Con quienes quieren adoptar a tus animales.'
    : user?.role === 'vet'
      ? 'Con las familias de tus pacientes.'
      : 'Con protectoras y veterinarios.';

  return (
    <div className={`mpl-messages${conversationId ? ' has-thread' : ''}`}>
      <section className="mpl-inbox" aria-label="Conversaciones">
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, fontWeight: 800, margin: '0 0 2px' }}>Mensajes</h1>
        <p style={{ color: MPL.muted, fontSize: 14, margin: '0 0 12px' }}>{sub}</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" className={`mpl-tab${filter === 'all' ? ' is-on' : ''}`} onClick={() => setFilter('all')}>Todos</button>
          <button type="button" className={`mpl-tab${filter === 'unread' ? ' is-on' : ''}`} onClick={() => setFilter('unread')}>
            Sin leer{unread ? ` · ${unread}` : ''}
          </button>
        </div>
        {listQ.isLoading ? (
          <div style={{ color: MPL.muted, padding: 12 }}>Cargando…</div>
        ) : listQ.isError ? (
          <div style={{ color: MPL.muted, padding: 12 }}>
            No se pudieron cargar los mensajes.{' '}
            <button type="button" className="mpl-link-btn" onClick={() => listQ.refetch()}>Reintentar</button>
          </div>
        ) : (
          <>
            <ConversationList items={items} selectedId={conversationId} filter={filter} />
            {!items.length && (
              <p style={{ color: MPL.muted, fontSize: 13.5, textAlign: 'center', margin: '0 8px' }}>
                {user?.role === 'tenant'
                  ? 'Cuando pidas adoptar un animal o una cita con el veterinario, la conversación aparecerá aquí.'
                  : 'Las conversaciones aparecen aquí con cada solicitud o cita nueva.'}
              </p>
            )}
          </>
        )}
      </section>
      {narrow ? (
        // En el móvil, a pantalla completa y en <body>: dentro del contenedor que
        // se desplaza (#root en la app de iPhone), WebKit la dejaba DEBAJO de la
        // cabecera de la app por mucho z-index que llevara.
        conversationId && createPortal(
          <div className="mpl-thread-overlay" role="dialog" aria-modal="true" aria-label="Conversación">
            <ChatThread key={conversationId} conversationId={conversationId} onBack={() => navigate('/mensajes')} />
          </div>,
          document.body,
        )
      ) : (
        <section className="mpl-thread-pane" aria-label="Conversación">
          {conversationId ? (
            <ChatThread key={conversationId} conversationId={conversationId} onBack={() => navigate('/mensajes')} />
          ) : (
            <div className="mpl-thread-empty">Elige una conversación para verla aquí.</div>
          )}
        </section>
      )}
    </div>
  );
}
