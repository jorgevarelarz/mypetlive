import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { CalendarDays, Camera, ChevronLeft, MapPin, PartyPopper, SendHorizontal, X } from 'lucide-react';
import {
  getConversation, getMessages, getSeenUntil, markRead, sendMessage,
  type ConversationSummary, type Message,
} from '../../api/chat';
import { acceptAdoptionVisit } from '../../api/adoptions';
import { acceptFoster, foundError, rejectFoster } from '../../api/found';
import { uploadImage } from '../../api/uploads';
import { useAuth } from '../../context/AuthContext';
import { MPL } from '../../styles/mypetlive';
import { toAbsoluteUrl } from '../../utils/media';
import { ConversationAvatar, statusPillOf } from './ConversationList';
import { dayLabel, sameDay, timeOf, whenLong } from './chatFormat';
import ProposeVisitDialog from './ProposeVisitDialog';
import { UNREAD_KEY } from '../../hooks/useUnreadMessages';

// Cada cuánto se miran mensajes nuevos con la conversación abierta y a la vista.
const POLL_MS = 4000;
const CLOSED_ADOPTION = ['aprobada', 'rechazada', 'cancelada'];

const isImage = (u?: string) => !!u && /\.(png|jpe?g|gif|webp|heic|avif)(?:$|\?)/i.test(u);
const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/** Enlace a la página de Citas con la cita o visita resaltada. */
function citasLink(conv: ConversationSummary) {
  const c = conv.context;
  if (c.type === 'adoption') return `/citas?visita=${c.adoptionId}`;
  if (c.type === 'vet_appointment') return `/citas?cita=${c.appointmentId}`;
  return '/citas';
}

/** Franja de arriba de un animal encontrado: qué es y a dónde lleva. */
function foundHeader(c: Extract<ConversationSummary['context'], { type: 'found' | 'foster' }>) {
  if (c.type === 'found') {
    return c.role === 'finder'
      ? { text: 'Cree que es suyo', link: `/buscar-casa/encontrado/${c.foundId}`, label: 'Ver pasos ›' }
      : { text: 'Animal encontrado', link: `/encontrados/${c.foundId}`, label: 'Ver ficha ›' };
  }
  if (c.role === 'finder') return { text: 'Ayuda de una protectora', link: c.fosterAccepted ? `/acogida/${c.foundId}` : `/buscar-casa/encontrado/${c.foundId}`, label: c.fosterAccepted ? 'Ver acuerdo ›' : 'Ver pasos ›' };
  return { text: 'Animal encontrado: piden ayuda', link: c.fosterAccepted ? `/acogida/${c.foundId}` : `/encontrados/${c.foundId}`, label: c.fosterAccepted ? 'Ver acuerdo ›' : 'Ver ficha ›' };
}

/** Tarjetas de un animal encontrado y su acogida. La protectora responde desde aquí. */
function FosterCard({ m, conv, onChanged }: { m: Message; conv: ConversationSummary; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const c = conv.context;
  if (c.type !== 'foster') return <div className="mpl-sys">{m.body}</div>;
  const code = m.systemCode || '';
  const respond = async (accept: boolean) => {
    if (!window.confirm(accept ? '¿Aceptáis? El animal sigue en su casa; vosotros lo registráis y firmáis su adopción.' : '¿Seguro que no podéis? Podrá pedírselo a otra protectora.')) return;
    setBusy(true);
    try { await (accept ? acceptFoster(c.foundId) : rejectFoster(c.foundId)); toast.success(accept ? 'Aceptada' : 'Respondido'); onChanged(); }
    catch (e) { toast.error(foundError(e)); } finally { setBusy(false); }
  };
  const pendingForShelter = code === 'foster.requested' && c.role === 'shelter' && c.status === 'acogida_pedida' && !c.fosterAccepted;
  const signForFinder = code === 'foster.accepted' && c.role === 'finder' && !c.fosterSigned;
  const keep = Boolean(m.payload?.keep);
  return (
    <div className="mpl-card" style={{ borderTop: `4px solid ${code === 'foster.requested' ? MPL.gold : MPL.teal}` }}>
      <div style={{ fontWeight: 800, fontSize: 14.5 }}>
        {code === 'foster.requested' ? '🏠 Piden ayuda con un animal encontrado' : code === 'foster.accepted' ? '✅ Acogida aceptada' : '📄 Acuerdo de acogida firmado'}
      </div>
      <div style={{ color: MPL.muted, fontSize: 13.5, marginTop: 4 }}>{m.body}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {pendingForShelter && (
          <>
            <CardButton primary onClick={() => respond(true)} disabled={busy}>Aceptar</CardButton>
            <CardButton onClick={() => respond(false)} disabled={busy}>No podemos</CardButton>
          </>
        )}
        {code === 'foster.requested' && c.role === 'finder' && !c.fosterAccepted && c.status === 'acogida_pedida' && (
          <span style={{ fontSize: 13, color: MPL.muted, alignSelf: 'center' }}>Esperando respuesta de la protectora.</span>
        )}
        {code === 'foster.requested' && <CardButton to={`/encontrados/${c.foundId}`}>Ver ficha</CardButton>}
        {code === 'foster.accepted' && <CardButton primary={signForFinder} to={`/acogida/${c.foundId}`}>{signForFinder ? 'Firmar el acuerdo' : 'Ver el acuerdo'}</CardButton>}
        {code === 'foster.signed' && c.role === 'shelter' && <CardButton primary to={keep ? '/landlord/adoptions' : '/landlord/animals'}>{keep ? 'Ver su adopción' : 'Ver en Mis animales'}</CardButton>}
        {code === 'foster.signed' && <CardButton to={`/acogida/${c.foundId}`}>Ver el acuerdo</CardButton>}
      </div>
      <div style={{ textAlign: 'right', fontSize: 11, color: MPL.muted, marginTop: 4 }}>{timeOf(m.createdAt)}</div>
    </div>
  );
}

function CardButton({ to, onClick, primary, children, disabled }: { to?: string; onClick?: () => void; primary?: boolean; children: React.ReactNode; disabled?: boolean }) {
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '9px 14px', borderRadius: 12, fontWeight: 800, fontSize: 14, textDecoration: 'none', cursor: 'pointer', font: 'inherit',
    border: primary ? 0 : `1.5px solid ${MPL.border}`, background: primary ? MPL.teal : '#fff', color: primary ? '#fff' : MPL.ink,
    opacity: disabled ? .6 : 1,
  };
  return to ? <Link to={to} style={style}>{children}</Link> : <button type="button" onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}

/**
 * Aviso del sistema dentro del chat. Las visitas y las citas salen como tarjeta
 * con su fecha y un botón a Citas; el resto, como una línea centrada.
 */
function SystemCard({
  m, conv, isLatestVisit, onAccept, onAskOther, onChangeVisit, accepting, onChanged,
}: {
  m: Message;
  conv: ConversationSummary;
  isLatestVisit: boolean;
  onAccept: () => void;
  onAskOther: () => void;
  onChangeVisit: () => void;
  accepting: boolean;
  onChanged: () => void;
}) {
  const code = m.systemCode || '';
  const p = m.payload || {};
  const ctx = conv.context;
  const at: string | undefined = p.at;

  const isVisit = code === 'adoption.visit' || code === 'adoption.visit_accepted';
  const isVetDated = ['vet.requested', 'vet.confirmed', 'vet.rescheduled'].includes(code);
  if ((isVisit || isVetDated) && at) {
    const title = code === 'adoption.visit'
      ? `${p.isNew === false ? 'Nueva fecha de visita' : 'Visita'} para conocer a ${p.animalName || conv.animal?.name || 'el animal'}`
      : code === 'adoption.visit_accepted' ? 'Visita confirmada ✅'
        : code === 'vet.requested' ? `Cita solicitada${p.service ? `: ${p.service}` : ''}`
          : code === 'vet.confirmed' ? 'Cita confirmada ✅' : 'Nueva fecha para la cita';
    const pending = code === 'adoption.visit' && isLatestVisit && ctx.type === 'adoption' && ctx.visit?.status === 'propuesta'
      && !CLOSED_ADOPTION.includes(ctx.status || '') && new Date(ctx.visit.at).getTime() > Date.now();
    const accent = code === 'adoption.visit_accepted' || code === 'vet.confirmed' ? MPL.teal : MPL.gold;
    return (
      <div className="mpl-card" style={{ borderTop: `4px solid ${accent}` }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: accent === MPL.teal ? MPL.teal100 : MPL.gold100, color: accent === MPL.teal ? MPL.tealDark : MPL.goldDark, display: 'grid', placeItems: 'center', flex: 'none' }}>
            <CalendarDays size={19} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5 }}>{title}</div>
            <div style={{ fontWeight: 800, fontSize: 16.5, color: MPL.ink, marginTop: 2 }}>{whenLong(at)}</div>
            {p.place && <div style={{ display: 'flex', gap: 5, alignItems: 'center', color: MPL.muted, fontSize: 13.5, marginTop: 3 }}><MapPin size={14} style={{ flex: 'none' }} /> {p.place}</div>}
            {p.reason && code === 'vet.requested' && <div style={{ color: MPL.muted, fontSize: 13.5, marginTop: 3 }}>{p.reason}</div>}
            {p.note && <div style={{ color: MPL.muted, fontSize: 13.5, marginTop: 6 }}>{p.note}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {pending && ctx.type === 'adoption' && ctx.role === 'adopter' && (
            <>
              <CardButton primary onClick={onAccept} disabled={accepting}>{accepting ? 'Un momento…' : 'Aceptar visita'}</CardButton>
              <CardButton onClick={onAskOther}>Proponer otra hora</CardButton>
            </>
          )}
          {pending && ctx.type === 'adoption' && ctx.role === 'shelter' && <CardButton onClick={onChangeVisit}>Cambiar fecha</CardButton>}
          <CardButton to={citasLink(conv)}>{isVisit ? 'Ver visita' : 'Ver cita'}</CardButton>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: MPL.muted, marginTop: 4 }}>{timeOf(m.createdAt)}</div>
      </div>
    );
  }

  if (['foster.requested', 'foster.accepted', 'foster.signed'].includes(code)) {
    return <FosterCard m={m} conv={conv} onChanged={onChanged} />;
  }

  // Cesión entre particulares: contrato listo, firmas y cambio de titular del chip.
  if (code === 'cession.contract' || code === 'cession.title_change') {
    const isTitle = code === 'cession.title_change';
    return (
      <div className="mpl-card" style={{ borderTop: `4px solid ${isTitle ? MPL.gold : MPL.teal}` }}>
        <div style={{ fontWeight: 800, fontSize: 14.5 }}>{isTitle ? 'Falta un paso: el cambio de titular del microchip' : '📄 Contrato de cesión gratuita'}</div>
        <div style={{ color: MPL.muted, fontSize: 13.5, marginTop: 4 }}>{m.body}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {isTitle && <CardButton to="/citas">Pedir cita al veterinario</CardButton>}
          <CardButton primary={!isTitle} to={`/contratos/${p.adoptionId}`}>{isTitle ? 'Ver contrato' : 'Leer y firmar'}</CardButton>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: MPL.muted, marginTop: 4 }}>{timeOf(m.createdAt)}</div>
      </div>
    );
  }

  const approved = code === 'adoption.status' && p.status === 'aprobada' && !p.undo;
  if (approved) {
    return (
      <div className="mpl-card" style={{ background: MPL.teal, color: '#fff', textAlign: 'center', border: 0 }}>
        <PartyPopper size={26} style={{ margin: '0 auto 6px', display: 'block' }} />
        <div style={{ fontWeight: 800, fontSize: 16.5 }}>{m.body}</div>
        <div style={{ fontSize: 11, opacity: .8, marginTop: 6 }}>{timeOf(m.createdAt)}</div>
      </div>
    );
  }
  return <div className="mpl-sys">{m.body}</div>;
}

export default function ChatThread({ conversationId, onBack }: { conversationId: string; onBack?: () => void }) {
  const { user } = useAuth();
  const me = String(user?._id || '');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const convQ = useQuery({
    queryKey: ['chat-conv', conversationId],
    queryFn: () => getConversation(conversationId),
    refetchInterval: 20_000,
  });
  const conv = convQ.data;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [seenUntil, setSeenUntil] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [visitDialog, setVisitDialog] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const lastAt = useRef<string | undefined>(undefined);
  const tickRef = useRef<() => void>(() => {});
  const refetchConv = useRef(convQ.refetch);
  refetchConv.current = convQ.refetch;

  const scrollToBottom = (smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  const afterRead = useCallback(() => {
    void markRead(conversationId).then(() => {
      void qc.invalidateQueries({ queryKey: UNREAD_KEY });
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    }).catch(() => {});
  }, [conversationId, qc]);

  // Carga inicial.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setMessages([]);
    setText('');
    setAttachment(undefined);
    lastAt.current = undefined;
    (async () => {
      try {
        const msgs = await getMessages(conversationId, { limit: 40 });
        if (cancelled) return;
        const asc = msgs.slice().reverse();
        setMessages(asc);
        setHasOlder(msgs.length === 40);
        lastAt.current = asc[asc.length - 1]?.createdAt;
        stickToBottom.current = true;
        setLoaded(true);
        afterRead();
        setSeenUntil(await getSeenUntil(conversationId).catch(() => null));
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId, afterRead]);

  // Mensajes nuevos cada pocos segundos, solo con la pestaña a la vista.
  useEffect(() => {
    if (!loaded) return;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const fresh = await getMessages(conversationId, lastAt.current ? { after: lastAt.current, limit: 100 } : { limit: 40 });
        if (fresh.length) {
          const asc = fresh.slice().reverse();
          setMessages(prev => {
            const known = new Set(prev.map(m => m._id));
            return [...prev, ...asc.filter(m => !known.has(m._id))];
          });
          lastAt.current = asc[asc.length - 1].createdAt;
          if (asc.some(m => m.senderId !== me)) {
            afterRead();
            // Una tarjeta nueva (visita, cita) cambia el estado de la cabecera.
            if (asc.some(m => m.type === 'system')) void refetchConv.current();
          }
        }
        setSeenUntil(await getSeenUntil(conversationId));
      } catch { /* siguiente vuelta */ }
    };
    tickRef.current = () => { void tick(); };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [loaded, conversationId, me, afterRead]);

  // Abajo del todo al llegar mensajes, salvo que esté leyendo más arriba.
  useLayoutEffect(() => {
    if (stickToBottom.current) scrollToBottom();
  }, [messages.length, loaded]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const loadOlder = async () => {
    const first = messages[0];
    if (!first) return;
    const el = listRef.current;
    const prevHeight = el?.scrollHeight || 0;
    const older = await getMessages(conversationId, { before: first.createdAt, limit: 40 });
    setHasOlder(older.length === 40);
    stickToBottom.current = false;
    setMessages(prev => [...older.slice().reverse(), ...prev]);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
  };

  const pickPhoto = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      // Se manda la ruta propia (/uploads/…): el servidor solo acepta ficheros suyos.
      setAttachment(new URL(url, window.location.href).pathname);
    } catch {
      toast.error('No se pudo subir la foto');
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !attachment) || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage(conversationId, body, attachment);
      stickToBottom.current = true;
      setMessages(prev => [...prev, msg]);
      lastAt.current = msg.createdAt;
      setText('');
      setAttachment(undefined);
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      inputRef.current?.focus();
    } catch (err: any) {
      toast.error(err?.response?.status === 429 ? 'Vas muy rápido: espera un momento.' : 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // En ordenador Intro envía y Mayús+Intro hace salto de línea; en el móvil
    // Intro es salto de línea y se envía con el botón (como en WhatsApp).
    if (e.key === 'Enter' && !e.shiftKey && !isTouch()) {
      e.preventDefault();
      void send();
    }
  };

  // Altura del cuadro de texto según lo escrito (hasta 5 líneas).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
  }, [text]);

  const acceptVisit = async () => {
    if (!conv || conv.context.type !== 'adoption') return;
    setAccepting(true);
    try {
      await acceptAdoptionVisit(conv.context.adoptionId);
      toast.success('Visita aceptada');
      await convQ.refetch();
      tickRef.current();
    } catch (err: any) {
      toast.error(err?.response?.data?.error === 'visit_in_past' ? 'Esa visita ya ha pasado.' : 'No se pudo aceptar la visita');
    } finally {
      setAccepting(false);
    }
  };

  const askOther = () => {
    setText('¿Podría ser otro día? Me vendría mejor ');
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  };

  if (convQ.isError) {
    return (
      <div className="mpl-thread" style={{ display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: MPL.muted }}>
        <div>
          <p>No se pudo abrir esta conversación.</p>
          <CardButton onClick={() => navigate('/mensajes')}>Volver a Mensajes</CardButton>
        </div>
      </div>
    );
  }

  const ctx = conv?.context;
  const pill = conv ? statusPillOf(conv) : null;
  const lastVisitId = [...messages].reverse().find(m => m.systemCode === 'adoption.visit')?._id;
  const isCession = ctx?.type === 'adoption' && Boolean(ctx.cession);
  // Las visitas son de protectoras; en una cesión lo que hay es un contrato.
  const canProposeVisit = ctx?.type === 'adoption' && ctx.role === 'shelter' && !isCession && !CLOSED_ADOPTION.includes(ctx.status || '');
  const hasContract = isCession && ['preaprobada', 'aprobada'].includes(ctx?.status || '');
  const fh = ctx && (ctx.type === 'found' || ctx.type === 'foster') ? foundHeader(ctx) : null;
  const detailLink = fh ? fh.link : ctx?.type === 'adoption'
    ? hasContract ? `/contratos/${ctx.adoptionId}` : isCession && ctx.role === 'shelter' ? '/buscar-casa' : `/adoptions/${ctx.adoptionId}`
    : ctx ? citasLink(conv!) : '#';
  const detailLabel = fh ? fh.label : ctx?.type === 'adoption' ? (hasContract ? 'Ver contrato ›' : 'Ver solicitud ›') : 'Ver cita ›';

  return (
    <div className="mpl-thread">
      <header className="mpl-thread-head safe-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <button type="button" onClick={onBack} aria-label="Volver a Mensajes" className="mpl-thread-back">
              <ChevronLeft size={24} strokeWidth={2.4} />
            </button>
          )}
          {conv && <ConversationAvatar conv={conv} size={42} />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv?.other.name || '…'}</div>
            {conv?.animal && <div style={{ fontSize: 12.5, color: MPL.muted }}>Sobre {conv.animal.name}</div>}
          </div>
        </div>
        {conv && (
          <div className="mpl-thread-ctx">
            {pill && <span className="mpl-pill" style={{ background: pill.bg, color: pill.color }}>{pill.label}</span>}
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ctx?.type === 'adoption'
                ? ctx.visit?.status === 'aceptada' && new Date(ctx.visit.at).getTime() > Date.now()
                  ? `Visita: ${whenLong(ctx.visit.at)}`
                  : isCession ? 'Cesión entre particulares' : 'Solicitud de adopción'
                : fh ? fh.text
                  : ctx?.type === 'vet_appointment' && ctx.at ? `${ctx.service || 'Cita'} · ${whenLong(ctx.at)}` : 'Cita veterinaria'}
            </span>
            {canProposeVisit && (
              <button type="button" onClick={() => setVisitDialog(true)} className="mpl-link-btn">
                {ctx?.type === 'adoption' && ctx.visit ? 'Cambiar visita' : 'Proponer visita'}
              </button>
            )}
            <Link to={detailLink} className="mpl-link-btn">{detailLabel}</Link>
          </div>
        )}
      </header>

      <div className="mpl-thread-msgs" ref={listRef} onScroll={onScroll}>
        {hasOlder && (
          <button type="button" onClick={loadOlder} className="mpl-older">Ver mensajes anteriores</button>
        )}
        {!loaded && <div className="mpl-sys">Cargando…</div>}
        {loaded && messages.length === 0 && (
          <div className="mpl-sys">Escribe el primer mensaje.</div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showDay = !prev || !sameDay(prev.createdAt, m.createdAt);
          const mine = m.type === 'user' && m.senderId === me;
          const seen = mine && seenUntil && new Date(m.createdAt).getTime() <= new Date(seenUntil).getTime();
          return (
            <React.Fragment key={m._id}>
              {showDay && <div className="mpl-day">{dayLabel(m.createdAt)}</div>}
              {m.type === 'system' ? (
                conv && (
                  <SystemCard
                    m={m}
                    conv={conv}
                    isLatestVisit={m._id === lastVisitId}
                    onAccept={acceptVisit}
                    onAskOther={askOther}
                    onChangeVisit={() => setVisitDialog(true)}
                    onChanged={() => { void convQ.refetch(); tickRef.current(); }}
                    accepting={accepting}
                  />
                )
              ) : (
                <div className={`mpl-bubble ${mine ? 'is-mine' : 'is-theirs'}`}>
                  {m.attachmentUrl && (
                    isImage(m.attachmentUrl) ? (
                      <a href={toAbsoluteUrl(m.attachmentUrl)} target="_blank" rel="noreferrer" className="mpl-bubble-photo">
                        <img src={toAbsoluteUrl(m.attachmentUrl)} alt="Foto enviada" loading="lazy" />
                      </a>
                    ) : (
                      <a href={toAbsoluteUrl(m.attachmentUrl)} target="_blank" rel="noreferrer">📎 Archivo adjunto</a>
                    )
                  )}
                  {m.body && <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</span>}
                  <span className="mpl-bubble-time">{timeOf(m.createdAt)}{seen ? ' · Visto' : ''}</span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <form className="mpl-composer" onSubmit={e => { e.preventDefault(); void send(); }}>
        {attachment && (
          <div className="mpl-attach">
            <img src={toAbsoluteUrl(attachment)} alt="" />
            <span>Foto lista para enviar</span>
            <button type="button" onClick={() => setAttachment(undefined)} aria-label="Quitar foto"><X size={16} /></button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <label className="mpl-icon-btn" aria-label="Enviar una foto" title="Enviar una foto" style={{ opacity: uploading ? .5 : 1 }}>
            <Camera size={23} />
            <input type="file" accept="image/*" onChange={e => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} style={{ display: 'none' }} disabled={uploading} />
          </label>
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={2000}
            placeholder={uploading ? 'Subiendo foto…' : 'Escribe un mensaje…'}
            aria-label="Mensaje"
            className="mpl-input"
          />
          <button type="submit" className="mpl-send" aria-label="Enviar" disabled={sending || uploading || (!text.trim() && !attachment)}>
            <SendHorizontal size={20} />
          </button>
        </div>
      </form>

      {visitDialog && ctx?.type === 'adoption' && (
        <ProposeVisitDialog
          adoptionId={ctx.adoptionId}
          animalName={conv?.animal?.name}
          initial={{ place: ctx.visit?.place }}
          onClose={() => setVisitDialog(false)}
          onDone={() => { setVisitDialog(false); void convQ.refetch(); tickRef.current(); }}
        />
      )}
    </div>
  );
}
