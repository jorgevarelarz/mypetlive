import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Camera, Film, Heart, PenLine, AlignLeft, Trash2, X } from 'lucide-react';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { toAbsoluteUrl } from '../../utils/media';
import { shareLink } from '../../utils/native';
import { uploadImage } from '../../api/uploads';
import {
  addMemorialMedia,
  addMemory,
  deleteMessage,
  getFamilyMemorial,
  monthLabel,
  removeMemorialMedia,
  removeMemory,
  setMessageStatus,
  stopMemorial,
  updateMemorial,
  uploadVideo,
  type Memorial,
  type MemorialFavorites,
} from '../../api/memorial';

// «Mi mascota» de una mascota que ha fallecido: en vez del cuidado diario, su
// mural. Aquí la familia lo llena, lee los mensajes que dejan las visitas y
// decide cuáles se publican.

type Props = { animal: any; onChanged: () => void };
type Section = 'media' | 'memories' | 'favorites' | 'words' | null;

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 16 };
const h2: React.CSSProperties = { margin: 0, fontFamily: MPL_FONT_DISPLAY, fontWeight: 700, fontSize: 20 };
const input: React.CSSProperties = {
  height: 46, border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '0 12px', font: 'inherit',
  fontSize: 16, fontWeight: 400, color: MPL.ink, background: '#fff', width: '100%', boxSizing: 'border-box',
};
const label: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 15, fontWeight: 600 };
const primary: React.CSSProperties = { height: 46, borderRadius: 12, border: 0, background: MPL.teal, color: '#fff', font: 'inherit', fontWeight: 700, fontSize: 15, padding: '0 16px' };
const secondary: React.CSSProperties = { height: 44, borderRadius: 12, border: `1px solid ${MPL.border}`, background: '#fff', color: MPL.ink, font: 'inherit', fontWeight: 600, fontSize: 14, padding: '0 14px' };

const FAVORITE_FIELDS: Array<[keyof MemorialFavorites, string, string]> = [
  ['food', 'Comida', 'Ej.: Acana Adult. Y el jamón que «no» le dábamos'],
  ['toy', 'Juguete', 'Ej.: una pelota de tenis que ya no tenía pelo'],
  ['place', 'Sitio', 'Ej.: la playa en invierno, cuando no había nadie'],
  ['nap', 'Siesta', 'Ej.: encima de la ropa recién planchada'],
  ['nicknames', 'Motes', 'Ej.: Lunita, la Jefa'],
];

function yearOf(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

export default function MemorialFamily({ animal, onChanged }: Props) {
  const id = String(animal._id || animal.id || '');
  const name = animal.name || 'tu mascota';
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const key = ['memorial', id];
  const q = useQuery({ queryKey: key, queryFn: () => getFamilyMemorial(id), enabled: Boolean(id) });
  const [open, setOpen] = React.useState<Section>(null);

  const setMemorial = (memorial: Memorial) =>
    queryClient.setQueryData(key, (old: any) => (old ? { ...old, memorial } : old));
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const m = q.data?.memorial;
  const code = q.data?.code;
  const messages = q.data?.messages || [];
  const pending = messages.filter(x => x.status === 'pending');
  const published = messages.filter(x => x.status === 'published');

  // ---- mensajes
  const moderate = useMutation({
    mutationFn: ({ messageId, status }: { messageId: string; status: 'published' | 'private' }) => setMessageStatus(id, messageId, status),
    onSuccess: (_d, v) => {
      toast.success(v.status === 'published' ? 'Publicado en su mural' : 'Guardado solo para vosotros');
      refresh();
    },
    onError: () => toast.error('No se ha podido guardar.'),
  });
  const removeMsg = useMutation({
    mutationFn: (messageId: string) => deleteMessage(id, messageId),
    onSuccess: refresh,
  });

  // ---- fotos y vídeos
  const [uploading, setUploading] = React.useState(false);
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 12)) {
        const { url } = await uploadImage(file);
        setMemorial((await addMemorialMedia(id, url)).memorial);
      }
      toast.success('Añadidas a su mural');
    } catch {
      toast.error('Alguna foto no se ha podido subir.');
    } finally {
      setUploading(false);
    }
  };
  const addVideo = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 80 * 1024 * 1024) {
      toast.error('Ese vídeo pesa demasiado (máximo 80 MB). Prueba con uno más corto.');
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadVideo(file);
      setMemorial((await addMemorialMedia(id, url)).memorial);
      toast.success('Vídeo añadido');
    } catch {
      toast.error('No se ha podido subir el vídeo. Tiene que ser MP4 o MOV.');
    } finally {
      setUploading(false);
    }
  };
  const removeMedia = useMutation({
    mutationFn: (url: string) => removeMemorialMedia(id, url),
    onSuccess: d => setMemorial(d.memorial),
  });

  // ---- recuerdos
  const [memMonth, setMemMonth] = React.useState('');
  const [memText, setMemText] = React.useState('');
  const [memPhoto, setMemPhoto] = React.useState<string | undefined>();
  const saveMemory = useMutation({
    mutationFn: () => addMemory(id, { month: memMonth || undefined, text: memText.trim(), photo: memPhoto }),
    onSuccess: d => {
      setMemorial(d.memorial);
      setMemMonth('');
      setMemText('');
      setMemPhoto(undefined);
      toast.success('Recuerdo guardado');
    },
    onError: () => toast.error('No se ha podido guardar.'),
  });
  const dropMemory = useMutation({
    mutationFn: (memoryId: string) => removeMemory(id, memoryId),
    onSuccess: d => setMemorial(d.memorial),
  });

  // ---- favoritos y palabras
  const [favorites, setFavorites] = React.useState<MemorialFavorites>({});
  const [epitaph, setEpitaph] = React.useState('');
  const [epitaphBy, setEpitaphBy] = React.useState('');
  const [diedAt, setDiedAt] = React.useState('');
  React.useEffect(() => {
    if (!m) return;
    setFavorites(m.favorites || {});
    setEpitaph(m.epitaph || '');
    setEpitaphBy(m.epitaphBy || '');
    setDiedAt(m.diedAt ? String(m.diedAt).slice(0, 10) : '');
    // Solo al cargar: lo que se está escribiendo no se pisa con cada refresco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(m)]);
  const saveText = useMutation({
    mutationFn: (patch: Parameters<typeof updateMemorial>[1]) => updateMemorial(id, patch),
    onSuccess: d => {
      setMemorial(d.memorial);
      setOpen(null);
      toast.success('Guardado');
    },
    onError: () => toast.error('No se ha podido guardar.'),
  });

  // ---- deshacer
  const undo = useMutation({
    mutationFn: () => stopMemorial(id),
    onSuccess: () => {
      toast.success(`${name} vuelve a estar como siempre`);
      onChanged();
    },
  });

  if (q.isLoading || !m) return <div style={{ padding: 16, color: MPL.muted }}>Cargando su mural…</div>;

  const hero = animal.images?.[0] || m.media.find(x => x.kind === 'image')?.url;
  const born = yearOf(animal.birthDate);
  const died = yearOf(m.diedAt);
  const isEmpty = !m.epitaph && !m.memories.length;
  const share = () => code && shareLink({ title: `En memoria de ${name}`, text: `El mural de ${name}`, path: `/p/${encodeURIComponent(code)}` });

  const row = (section: Exclude<Section, null>, icon: React.ReactNode, title: string, detail: string, action: string, last = false) => (
    <button
      type="button"
      onClick={() => setOpen(open === section ? null : section)}
      aria-expanded={open === section}
      style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: 0, border: 0, borderBottom: last && open !== section ? 0 : `1px solid ${MPL.border}`, background: 'transparent', color: MPL.ink, font: 'inherit', textAlign: 'left', width: '100%' }}
    >
      <span style={{ color: MPL.teal, display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 16 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 14, color: MPL.muted }}>{detail}</span>
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: MPL.teal }}>{open === section ? 'Cerrar' : action}</span>
    </button>
  );

  const favoriteCount = FAVORITE_FIELDS.filter(([k]) => m.favorites?.[k]).length;

  return (
    <div style={{ display: 'grid', gap: 14, fontFamily: MPL_FONT_BODY, color: MPL.ink }}>
      {isEmpty && (
        <div style={{ background: MPL.olive100, borderRadius: 16, padding: '14px 16px', fontSize: 15, lineHeight: 1.45 }}>
          Gracias por estos años con {name}. Su mural ya está listo para llenarlo de recuerdos.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {hero && <img src={toAbsoluteUrl(hero)} alt="" style={{ width: 72, height: 72, borderRadius: 20, objectFit: 'cover' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: MPL.muted }}>En memoria</div>
          <div style={{ fontFamily: MPL_FONT_DISPLAY, fontWeight: 700, fontSize: 30, lineHeight: 1.1 }}>{name}</div>
          {(born || died) && <div style={{ fontSize: 14, color: MPL.muted }}>{[born, died].filter(Boolean).join(' — ')}</div>}
        </div>
      </div>

      {code && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <button type="button" onClick={() => nav(`/p/${encodeURIComponent(code)}`)} style={{ ...primary, height: 48 }}>Ver su mural</button>
          <button type="button" onClick={share} style={{ ...secondary, height: 48, fontWeight: 700, fontSize: 15 }}>Compartir</button>
        </div>
      )}

      {pending.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h2 style={h2}>Mensajes por leer</h2>
            <span style={{ fontSize: 14, fontWeight: 700, color: MPL.coral }}>{pending.length === 1 ? '1 nuevo' : `${pending.length} nuevos`}</span>
          </div>
          <p style={{ margin: '4px 0 12px', fontSize: 14, color: MPL.muted }}>Solo salen en el mural si los publicas.</p>
          {pending.map((msg, i) => (
            <div key={msg._id} style={{ borderTop: `1px solid ${MPL.border}`, paddingTop: 12, marginTop: i ? 14 : 0, display: 'grid', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.45, whiteSpace: 'pre-line' }}>{msg.text}</p>
              <div style={{ fontSize: 14, fontWeight: 600, color: MPL.muted }}>{msg.name}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={moderate.isPending} onClick={() => moderate.mutate({ messageId: msg._id, status: 'published' })} style={{ ...primary, flex: 1, height: 44, fontSize: 14 }}>Publicar</button>
                <button type="button" disabled={moderate.isPending} onClick={() => moderate.mutate({ messageId: msg._id, status: 'private' })} style={{ ...secondary, flex: 1 }}>Solo para mí</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <h2 style={{ ...h2, marginBottom: 12 }}>Llenar su mural</h2>

        {row('media', <Camera size={22} />, 'Fotos y vídeos', m.media.length ? `${m.media.length} en su mural` : 'Aún no hay ninguna', 'Añadir')}
        {open === 'media' && (
          <div style={{ display: 'grid', gap: 10, padding: '12px 0', borderBottom: `1px solid ${MPL.border}` }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ ...secondary, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
                <Camera size={16} /> Fotos
                <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={e => { void addPhotos(e.target.files); e.target.value = ''; }} />
              </label>
              <label style={{ ...secondary, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
                <Film size={16} /> Vídeo
                <input type="file" accept="video/mp4,video/quicktime,video/*" hidden disabled={uploading} onChange={e => { void addVideo(e.target.files); e.target.value = ''; }} />
              </label>
              {uploading && <span style={{ alignSelf: 'center', fontSize: 14, color: MPL.muted }}>Subiendo…</span>}
            </div>
            {m.media.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                {m.media.map(item => (
                  <div key={item.url} style={{ position: 'relative' }}>
                    {item.kind === 'video' ? (
                      <video src={toAbsoluteUrl(item.url)} muted playsInline preload="metadata" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, background: '#000', display: 'block' }} />
                    ) : (
                      <img src={toAbsoluteUrl(item.url)} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                    )}
                    <button
                      type="button"
                      aria-label="Quitar del mural"
                      onClick={() => removeMedia.mutate(item.url)}
                      style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, padding: 0, borderRadius: 999, border: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {row('memories', <PenLine size={22} />, 'Recuerdos', m.memories.length ? `${m.memories.length} ${m.memories.length === 1 ? 'recuerdo' : 'recuerdos'}` : 'Pequeñas historias que no queréis olvidar', 'Escribir')}
        {open === 'memories' && (
          <div style={{ display: 'grid', gap: 10, padding: '12px 0', borderBottom: `1px solid ${MPL.border}` }}>
            {m.memories.map(memory => (
              <div key={memory._id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: MPL.bg, borderRadius: 12, padding: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {monthLabel(memory.month) && <div style={{ fontSize: 13, fontWeight: 600, color: MPL.muted }}>{monthLabel(memory.month)}</div>}
                  <div style={{ fontSize: 15, lineHeight: 1.4, whiteSpace: 'pre-line' }}>{memory.text}</div>
                </div>
                <button type="button" aria-label="Borrar este recuerdo" onClick={() => dropMemory.mutate(memory._id)} style={{ padding: 0, width: 36, height: 36, border: 0, background: 'none', color: MPL.muted }}>
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            <label style={label}>
              ¿Cuándo fue? <span style={{ fontWeight: 400, fontSize: 13, color: MPL.muted }}>Mes y año, si lo recuerdas</span>
              <input type="month" value={memMonth} onChange={e => setMemMonth(e.target.value)} style={input} />
            </label>
            <label style={label}>
              Cuéntalo
              <textarea
                value={memText}
                onChange={e => setMemText(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder={`Ej.: El día que llegó ${name} cabía en una zapatilla.`}
                style={{ ...input, height: 'auto', padding: 12, resize: 'vertical' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {memPhoto ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <img src={toAbsoluteUrl(memPhoto)} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
                  <button type="button" onClick={() => setMemPhoto(undefined)} style={{ ...secondary, height: 36 }}>Quitar foto</button>
                </span>
              ) : (
                <label style={{ ...secondary, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <Camera size={16} /> Con foto
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      try { setMemPhoto((await uploadImage(file)).url); } catch { toast.error('No se ha podido subir la foto.'); }
                    }}
                  />
                </label>
              )}
              <button type="button" onClick={() => saveMemory.mutate()} disabled={!memText.trim() || saveMemory.isPending} style={{ ...primary, marginLeft: 'auto', opacity: !memText.trim() ? 0.6 : 1 }}>
                {saveMemory.isPending ? 'Guardando…' : 'Guardar recuerdo'}
              </button>
            </div>
          </div>
        )}

        {row('favorites', <Heart size={22} />, 'Sus cosas favoritas', favoriteCount ? `${favoriteCount} de 5` : 'Comida, juguete, sitio, siesta, motes', 'Editar')}
        {open === 'favorites' && (
          <div style={{ display: 'grid', gap: 10, padding: '12px 0', borderBottom: `1px solid ${MPL.border}` }}>
            {FAVORITE_FIELDS.map(([k, title, placeholder]) => (
              <label key={k} style={label}>
                {title}
                <input value={favorites[k] || ''} maxLength={160} placeholder={placeholder} onChange={e => setFavorites(f => ({ ...f, [k]: e.target.value }))} style={input} />
              </label>
            ))}
            {m.favorites?.food && (
              <p style={{ margin: 0, fontSize: 13, color: MPL.muted }}>La comida la hemos sacado de lo que más le apuntabais. Cámbiala si no es su favorita.</p>
            )}
            <button type="button" onClick={() => saveText.mutate({ favorites })} disabled={saveText.isPending} style={{ ...primary, justifySelf: 'end' }}>
              {saveText.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}

        {row('words', <AlignLeft size={22} />, 'Unas palabras', m.epitaph ? `«${m.epitaph.slice(0, 40)}${m.epitaph.length > 40 ? '…' : ''}»` : 'La frase que sale bajo su nombre', 'Editar', true)}
        {open === 'words' && (
          <div style={{ display: 'grid', gap: 10, paddingTop: 12 }}>
            <label style={label}>
              Bajo su nombre
              <textarea
                value={epitaph}
                onChange={e => setEpitaph(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="Ej.: Doce años durmiendo a los pies de la cama."
                style={{ ...input, height: 'auto', padding: 12, resize: 'vertical' }}
              />
            </label>
            <label style={label}>
              Firmado por
              <input value={epitaphBy} maxLength={120} placeholder="Ej.: Ana, Pablo y Sara" onChange={e => setEpitaphBy(e.target.value)} style={input} />
            </label>
            <label style={label}>
              Cuándo os dejó
              <input type="date" value={diedAt} max={new Date().toISOString().slice(0, 10)} onChange={e => setDiedAt(e.target.value)} style={input} />
            </label>
            <button type="button" onClick={() => saveText.mutate({ epitaph, epitaphBy, diedAt: diedAt || null })} disabled={saveText.isPending} style={{ ...primary, justifySelf: 'end' }}>
              {saveText.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>

      {published.length > 0 && (
        <div style={card}>
          <h2 style={{ ...h2, marginBottom: 8 }}>Mensajes publicados</h2>
          {published.map(msg => (
            <div key={msg._id} style={{ borderTop: `1px solid ${MPL.border}`, padding: '10px 0', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, lineHeight: 1.4 }}>{msg.text}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: MPL.muted, marginTop: 4 }}>{msg.name}</div>
              </div>
              <button type="button" onClick={() => moderate.mutate({ messageId: msg._id, status: 'private' })} style={{ ...secondary, height: 36, fontSize: 13 }}>Quitar</button>
            </div>
          ))}
        </div>
      )}

      {messages.some(x => x.status === 'private') && (
        <details style={{ ...card, padding: '12px 16px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Guardados solo para vosotros ({messages.filter(x => x.status === 'private').length})</summary>
          {messages.filter(x => x.status === 'private').map(msg => (
            <div key={msg._id} style={{ borderTop: `1px solid ${MPL.border}`, padding: '10px 0', marginTop: 8, display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 15, lineHeight: 1.4 }}>{msg.text}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: MPL.muted }}>{msg.name}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => moderate.mutate({ messageId: msg._id, status: 'published' })} style={{ ...secondary, height: 36, fontSize: 13 }}>Publicar</button>
                <button type="button" onClick={() => removeMsg.mutate(msg._id)} style={{ ...secondary, height: 36, fontSize: 13 }}>Borrar</button>
              </div>
            </div>
          ))}
        </details>
      )}

      <div style={{ display: 'grid', gap: 4, padding: '6px 4px 0' }}>
        {code && <div style={{ fontSize: 14, color: MPL.muted }}>Su chapa {code} enseña ahora este mural.</div>}
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`¿${name} sigue con vosotros? Su ficha vuelve a ser la de siempre y se guarda lo que hayáis escrito.`)) undo.mutate();
          }}
          style={{ justifySelf: 'start', padding: '6px 0', border: 0, background: 'none', color: MPL.teal, font: 'inherit', fontWeight: 600, fontSize: 14 }}
        >
          Ha sido un error: {name} sigue con nosotros
        </button>
      </div>
    </div>
  );
}
