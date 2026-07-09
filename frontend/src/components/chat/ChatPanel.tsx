import React, { useEffect, useRef, useState } from 'react';
import { ensureConversation, getMessages, sendMessage, markRead, type Message } from '../../api/chat';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';

export default function ChatPanel({ kind, refId, title }: { kind: 'ticket'|'contract'|'appointment'|'adoption'; refId: string; title?: string }) {
  const [conversationId, setConversationId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const isImageUrl = (u?: string) => !!u && /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(u);
  const isPdfUrl = (u?: string) => !!u && /\.pdf(?:$|\?)/i.test(u);
  const fileNameFromUrl = (u?: string) => {
    try {
      if (!u) return '';
      const p = u.split('?')[0];
      const seg = p.split('/');
      return seg[seg.length - 1] || 'archivo';
    } catch { return 'archivo'; }
  };

  useEffect(() => {
    (async () => {
      if (!refId) return;
      const conv = await ensureConversation(kind, refId);
      setConversationId(conv._id);
      const msgs = await getMessages(conv._id, { limit: 50 });
      // backend devuelve descendente; mostramos ascendente
      setMessages(msgs.slice().reverse());
      // scroll bottom
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }), 0);
      // marca como leído para el usuario actual
      try { await markRead(conv._id); } catch {}
    })();
  }, [kind, refId]);

  const onSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!conversationId || (!body.trim() && !attachmentUrl)) return;
    const msg = await sendMessage(conversationId, body.trim(), attachmentUrl);
    setMessages((prev) => [...prev, msg]);
    setBody('');
    setAttachmentUrl(undefined);
    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 0);
    try { await markRead(conversationId); } catch {}
  };

  const loadMore = async () => {
    if (!conversationId || messages.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const older = await getMessages(conversationId, { before: oldest.createdAt, limit: 50 });
      const olderAsc = older.slice().reverse();
      if (olderAsc.length) setMessages(prev => [...olderAsc, ...prev]);
    } finally {
      setLoadingMore(false);
    }
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);
    const form = new FormData();
    form.append('files', file);
    try {
      setUploading(true);
      const res = await axios.post('/api/uploads/images', form);
      const urls: string[] = res.data?.urls || [];
      if (urls.length > 0) setAttachmentUrl(urls[0]);
      else setUploadError('No se devolvió URL');
    } catch (e: any) {
      setUploadError(e?.response?.data?.error || e?.message || 'Error subiendo archivo');
    } finally {
      setUploading(false);
    }
  };

  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave: React.DragEventHandler<HTMLDivElement> = () => setIsDragging(false);
  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) await onPickFile(f);
  };

  if (!refId) return null;
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      {title !== '' && <h3 style={{ marginTop: 0 }}>{title || 'Conversación'}</h3>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <button onClick={loadMore} disabled={loadingMore || !messages.length} className="btn">
          {loadingMore ? 'Cargando…' : 'Cargar mensajes anteriores'}
        </button>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{user ? 'Tú: ' + (user.email || user._id) : ''}</div>
      </div>
      <div
        ref={listRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          maxHeight: 260,
          overflowY: 'auto',
          display: 'grid',
          gap: 6,
          padding: 8,
          borderRadius: 6,
          background: isDragging ? '#eef2ff' : '#fafafa',
          outline: isDragging ? '2px dashed #6366f1' : 'none',
          transition: 'background 120ms',
        }}
        title="Arrastra y suelta archivos para adjuntar"
      >
        {messages.map((m) => (
          <div key={m._id} style={{ fontSize: 14 }}>
            {m.type === 'system' ? (
              <em style={{ color: '#6b7280' }}>[{m.systemCode}]</em>
            ) : (
              <>
                {m.body && <span>{m.body}</span>}
                {m.body && (m as any).attachmentUrl && <span> · </span>}
                {(m as any).attachmentUrl && (
                  isImageUrl((m as any).attachmentUrl) ? (
                    <a href={(m as any).attachmentUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 4 }}>
                      <img
                        src={(m as any).attachmentUrl}
                        alt="adjunto"
                        style={{ maxWidth: 180, maxHeight: 140, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }}
                      />
                    </a>
                  ) : isPdfUrl((m as any).attachmentUrl) ? (
                    <a href={(m as any).attachmentUrl} target="_blank" rel="noreferrer">📄 {fileNameFromUrl((m as any).attachmentUrl)}</a>
                  ) : (
                    <a href={(m as any).attachmentUrl} target="_blank" rel="noreferrer">{fileNameFromUrl((m as any).attachmentUrl)}</a>
                  )
                )}
              </>
            )}
            <span style={{ marginLeft: 8, color: '#9ca3af', fontSize: 12 }}>{m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}</span>
          </div>
        ))}
        {messages.length === 0 && <div style={{ color: '#6b7280' }}>No hay mensajes.</div>}
      </div>
      <form onSubmit={onSend} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <input
          value={body}
          onChange={(e)=>setBody(e.target.value)}
          onPaste={async (e) => {
            try { const f = e.clipboardData?.files?.[0]; if (f) await onPickFile(f); } catch {}
          }}
          placeholder="Escribe un mensaje…"
          style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 10px' }}
        />
        <label className="btn" style={{ cursor: 'pointer' }} title="Abrir cámara (móvil)">
          📷 Cámara
          <input type="file" onChange={(e)=>onPickFile(e.target.files?.[0] || null)} style={{ display: 'none' }} accept="image/*" capture="environment" />
        </label>
        <label className="btn" style={{ cursor: 'pointer' }}>
          {uploading ? 'Subiendo…' : 'Adjuntar'}
          <input type="file" onChange={(e)=>onPickFile(e.target.files?.[0] || null)} style={{ display: 'none' }} accept="image/*,.pdf" />
        </label>
        <button type="submit" className="btn" disabled={!body.trim() && !attachmentUrl}>Enviar</button>
      </form>
      {attachmentUrl && (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          Adjuntando: {isImageUrl(attachmentUrl) ? (
            <a href={attachmentUrl} target="_blank" rel="noreferrer">imagen</a>
          ) : isPdfUrl(attachmentUrl) ? (
            <a href={attachmentUrl} target="_blank" rel="noreferrer">📄 {fileNameFromUrl(attachmentUrl)}</a>
          ) : (
            <a href={attachmentUrl} target="_blank" rel="noreferrer">{fileNameFromUrl(attachmentUrl)}</a>
          )}
        </div>
      )}
      {uploadError && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>{uploadError}</div>}
    </div>
  );
}
