import React from 'react';
import { createPortal } from 'react-dom';
import { Share2, X } from 'lucide-react';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { lightCandle, leaveMemorialMessage, longDate, monthLabel, type PublicMemorial, type MemorialMedia } from '../../api/memorial';
import { shareLink } from '../../utils/native';
import { toAbsoluteUrl } from '../../utils/media';

// El mural «en su memoria»: lo que enseña el QR de la chapa cuando la familia
// ha despedido a su mascota. Sereno y sin adornos: fotos grandes, sus cosas y
// lo que escribieron quienes la quisieron. Nada de ofertas ni datos de salud.

type Props = { code: string; name: string; image?: string; memorial: PublicMemorial };

const FAVORITE_LABELS: Array<[keyof PublicMemorial['favorites'], string]> = [
  ['food', 'Comida'],
  ['toy', 'Juguete'],
  ['place', 'Sitio'],
  ['nap', 'Siesta'],
  ['nicknames', 'Motes'],
];

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18 };
const h2: React.CSSProperties = { fontFamily: MPL_FONT_DISPLAY, fontWeight: 700, fontSize: 24, margin: '0 0 14px' };
const muted: React.CSSProperties = { color: MPL.muted };

const CANDLE_KEY = (code: string) => `mpl.candle.${code}`;

function Candle({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={MPL.coral} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2c1.5 2 2.5 3.4 2.5 4.8A2.5 2.5 0 0 1 12 9.3a2.5 2.5 0 0 1-2.5-2.5C9.5 5.4 10.5 4 12 2z" />
      <rect x="8.5" y="11" width="7" height="11" rx="1.5" />
      <path d="M12 9.3V11" />
    </svg>
  );
}

function MediaTile({ item, onOpen }: { item: MemorialMedia; onOpen: () => void }) {
  const src = toAbsoluteUrl(item.url);
  if (item.kind === 'video') {
    return (
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, background: '#000' }}
      />
    );
  }
  return (
    <button type="button" onClick={onOpen} aria-label="Ver la foto en grande" style={{ padding: 0, border: 0, background: 'none', display: 'block' }}>
      <img src={src} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, display: 'block' }} />
    </button>
  );
}

export default function MemorialMural({ code, name, image, memorial }: Props) {
  const m = memorial;
  const photos = m.media.length ? m.media : image ? [{ url: image, kind: 'image' as const }] : [];
  // La foto de su ficha: la que la familia eligió para representarla.
  const hero = image || photos.find(p => p.kind === 'image')?.url;

  const [candles, setCandles] = React.useState(m.candles);
  const [lit, setLit] = React.useState(() => {
    try { return localStorage.getItem(CANDLE_KEY(code)) === '1'; } catch { return false; }
  });
  const [showAll, setShowAll] = React.useState(false);
  const [zoom, setZoom] = React.useState<string | null>(null);

  const [writing, setWriting] = React.useState(false);
  const [msgName, setMsgName] = React.useState('');
  const [msgText, setMsgText] = React.useState('');
  const [msgState, setMsgState] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const light = async () => {
    if (lit) return;
    setLit(true);
    setCandles(c => c + 1);
    try { localStorage.setItem(CANDLE_KEY(code), '1'); } catch { /* sin memoria, se puede encender otra vez */ }
    try {
      const r = await lightCandle(code);
      setCandles(r.candles);
    } catch { /* la vela ya se ve encendida; el contador se corrige al volver */ }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgName.trim() || !msgText.trim()) return;
    setMsgState('sending');
    try {
      await leaveMemorialMessage(code, msgName.trim(), msgText.trim());
      setMsgState('sent');
    } catch {
      setMsgState('error');
    }
  };

  const share = () =>
    shareLink({ title: `En memoria de ${name}`, text: `El mural de ${name}`, path: `/p/${encodeURIComponent(code)}` });

  const born = longDate(m.bornAt);
  const died = longDate(m.diedAt);
  const dates = born && died ? `${born} — ${died}` : died ? `Nos dejó el ${died}` : null;
  const favorites = FAVORITE_LABELS.filter(([key]) => m.favorites?.[key]);
  const visible = showAll ? photos : photos.slice(0, 6);

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink, maxWidth: 560, margin: '0 auto', width: '100%', display: 'grid', gap: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={share}
          style={{ display: 'flex', alignItems: 'center', gap: 6, height: 44, padding: '0 14px', borderRadius: 12, border: `1px solid ${MPL.border}`, background: '#fff', color: MPL.ink, font: 'inherit', fontWeight: 600, fontSize: 14 }}
        >
          <Share2 size={16} /> Compartir
        </button>
      </div>

      {hero && (
        <img
          src={toAbsoluteUrl(hero)}
          alt={name}
          style={{ display: 'block', width: '100%', aspectRatio: '9 / 10', objectFit: 'cover', borderRadius: 22, marginTop: 12 }}
        />
      )}

      <div style={{ padding: '22px 4px 0', display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', ...muted }}>En memoria de</span>
        <h1 style={{ margin: 0, fontFamily: MPL_FONT_DISPLAY, fontWeight: 700, fontSize: 58, lineHeight: 1 }}>{name}</h1>
        {dates && <span style={{ fontSize: 16, ...muted }}>{dates}</span>}
        {m.epitaph && <p style={{ margin: '14px 0 0', fontSize: 19, lineHeight: 1.45, whiteSpace: 'pre-line' }}>{m.epitaph}</p>}
        {m.epitaph && (m.epitaphBy || m.by) && <span style={{ fontSize: 14, marginTop: 4, ...muted }}>— {m.epitaphBy || m.by}</span>}
      </div>

      <div style={{ ...card, marginTop: 22, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Candle />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {candles === 0 ? 'Enciende la primera vela' : `${candles} ${candles === 1 ? 'vela encendida' : 'velas encendidas'}`}
          </div>
          <div style={{ fontSize: 13, ...muted }}>
            {lit ? 'Gracias. La familia verá que te has acordado.' : 'Para que sepan que te acuerdas'}
          </div>
        </div>
        <button
          type="button"
          onClick={light}
          disabled={lit}
          style={{ height: 44, padding: '0 14px', borderRadius: 12, border: 0, background: lit ? MPL.coral100 : MPL.coral, color: lit ? '#8F3827' : '#fff', font: 'inherit', fontWeight: 700, fontSize: 14 }}
        >
          {lit ? 'Encendida' : 'Encender'}
        </button>
      </div>

      {m.stats.length > 0 && (
        <section style={{ paddingTop: 34 }}>
          <h2 style={h2}>Sus números</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {m.stats.map(s => (
              <div key={s.key} style={{ ...card, borderRadius: 16, padding: 14 }}>
                <div style={{ fontFamily: MPL_FONT_DISPLAY, fontWeight: 700, fontSize: 30, color: MPL.teal }}>
                  {s.value.toLocaleString('es-ES')}
                </div>
                <div style={{ fontSize: 14, ...muted }}>{s.label}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 13, ...muted }}>Sale de lo que su familia fue apuntando en MyPetLive.</p>
        </section>
      )}

      {favorites.length > 0 && (
        <section style={{ paddingTop: 34 }}>
          <h2 style={{ ...h2, marginBottom: 6 }}>Sus cosas favoritas</h2>
          <div>
            {favorites.map(([key, label], i) => (
              <div key={key} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: i < favorites.length - 1 ? `1px solid ${MPL.border}` : 0 }}>
                <span style={{ width: 92, flexShrink: 0, fontSize: 14, fontWeight: 600, ...muted }}>{label}</span>
                <span style={{ fontSize: 16, lineHeight: 1.4 }}>{m.favorites[key]}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {photos.length > 1 && (
        <section style={{ paddingTop: 30 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ ...h2, margin: 0 }}>Fotos</h2>
            {photos.length > 6 && (
              <button type="button" onClick={() => setShowAll(v => !v)} style={{ padding: 0, border: 0, background: 'none', color: MPL.teal, font: 'inherit', fontWeight: 600, fontSize: 14 }}>
                {showAll ? 'Ver menos' : `Ver las ${photos.length}`}
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {visible.map(item => <MediaTile key={item.url} item={item} onOpen={() => setZoom(item.url)} />)}
          </div>
        </section>
      )}

      {m.memories.length > 0 && (
        <section style={{ paddingTop: 34 }}>
          <h2 style={h2}>Recuerdos</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {m.memories.map(memory => (
              <article key={memory._id} style={{ ...card, overflow: 'hidden' }}>
                {memory.photo && (
                  <img src={toAbsoluteUrl(memory.photo)} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'cover' }} />
                )}
                <div style={{ padding: '14px 16px' }}>
                  {monthLabel(memory.month) && <div style={{ fontSize: 13, fontWeight: 600, ...muted }}>{monthLabel(memory.month)}</div>}
                  <p style={{ margin: '4px 0 0', fontSize: 16, lineHeight: 1.45, whiteSpace: 'pre-line' }}>{memory.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section style={{ paddingTop: 34 }}>
        <h2 style={h2}>{m.messages.length ? `Quienes también quisieron a ${name}` : `Unas palabras para ${name}`}</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {m.messages.map(msg => (
            <div key={msg._id} style={{ ...card, padding: '14px 16px' }}>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.45, whiteSpace: 'pre-line' }}>{msg.text}</p>
              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, ...muted }}>{msg.name}</div>
            </div>
          ))}
        </div>

        {msgState === 'sent' ? (
          <div style={{ ...card, marginTop: 14, padding: '14px 16px', background: MPL.olive100, borderColor: MPL.olive100, fontSize: 15, lineHeight: 1.45 }}>
            Gracias. {m.by || 'Su familia'} lo leerá pronto.
          </div>
        ) : writing ? (
          <form onSubmit={send} style={{ ...card, marginTop: 14, padding: 16, display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 15, fontWeight: 600 }}>
              Tu nombre
              <input
                value={msgName}
                onChange={e => setMsgName(e.target.value)}
                maxLength={80}
                placeholder="Ej.: Marta, la vecina del 3.º"
                style={{ height: 46, border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '0 12px', font: 'inherit', fontSize: 16, fontWeight: 400 }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 15, fontWeight: 600 }}>
              Tu mensaje
              <textarea
                value={msgText}
                onChange={e => setMsgText(e.target.value)}
                maxLength={600}
                rows={4}
                style={{ border: `1px solid ${MPL.border}`, borderRadius: 12, padding: 12, font: 'inherit', fontSize: 16, fontWeight: 400, resize: 'vertical' }}
              />
            </label>
            {msgState === 'error' && <div style={{ fontSize: 14, color: '#8F3827' }}>No se ha podido enviar. Inténtalo de nuevo en un rato.</div>}
            <button
              type="submit"
              disabled={msgState === 'sending' || !msgName.trim() || !msgText.trim()}
              style={{ height: 50, borderRadius: 14, border: 0, background: MPL.teal, color: '#fff', font: 'inherit', fontWeight: 700, fontSize: 16, opacity: msgState === 'sending' ? 0.7 : 1 }}
            >
              {msgState === 'sending' ? 'Enviando…' : 'Enviar a su familia'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setWriting(true)}
            style={{ marginTop: 14, width: '100%', height: 50, borderRadius: 14, border: `1.5px solid ${MPL.teal}`, background: 'transparent', color: MPL.teal, font: 'inherit', fontWeight: 700, fontSize: 16 }}
          >
            Dejar un mensaje
          </button>
        )}
        {msgState !== 'sent' && (
          <p style={{ margin: '8px 0 0', fontSize: 13, textAlign: 'center', ...muted }}>Su familia lo leerá antes de publicarlo.</p>
        )}
      </section>

      <div style={{ padding: '40px 0 8px', textAlign: 'center', fontSize: 13, ...muted }}>
        Mural de {name} en MyPetLive · chapa {code}
      </div>

      {zoom && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Foto"
          onClick={() => setZoom(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(10,12,10,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setZoom(null)}
            className="safe-top"
            style={{ position: 'absolute', top: 12, right: 12, width: 44, height: 44, padding: 0, borderRadius: 999, border: 0, background: 'rgba(255,255,255,0.15)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={22} />
          </button>
          <img src={toAbsoluteUrl(zoom)} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
        </div>,
        document.body,
      )}
    </div>
  );
}
