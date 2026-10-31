import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { MapPin } from 'lucide-react';
import { claimFound, foundError, getFound, listFound } from '../../api/found';
import { useAuth } from '../../context/AuthContext';
import { useAuthModal } from '../../context/AuthModalContext';
import { MPL, MPL_FONT_DISPLAY, speciesLabel } from '../../styles/mypetlive';
import { toAbsoluteUrl } from '../../utils/media';

const day = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long' });

/** «Animales encontrados»: público, para que su familia los reconozca. */
export function FoundListPage() {
  const q = useQuery({ queryKey: ['found-public'], queryFn: listFound });
  const items = q.data || [];
  return (
    <div style={{ display: 'grid', gap: 16, padding: 'clamp(14px, 4vw, 24px)', maxWidth: 1000 }}>
      <header>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 32, fontWeight: 800, margin: 0 }}>Animales encontrados</h1>
        <p style={{ color: MPL.muted, margin: '6px 0 0' }}>Los ha encontrado alguien y busca a su familia. Si reconoces a alguno, pulsa «Es mío».</p>
      </header>
      {q.isLoading ? <div style={{ color: MPL.muted }}>Cargando…</div> : !items.length ? (
        <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 16, padding: 18, color: MPL.muted }}>Ahora mismo no hay animales encontrados publicados.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
          {items.map(f => (
            <Link key={f._id} to={`/encontrados/${f._id}`} style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, overflow: 'hidden', color: MPL.ink, textDecoration: 'none' }}>
              <div style={{ height: 180, background: MPL.panel }}>{f.images[0] && <img src={toAbsoluteUrl(f.images[0])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
              <div style={{ padding: '12px 14px 14px' }}>
                <strong style={{ fontSize: 16 }}>{speciesLabel(f.species)}{f.name ? ` · «${f.name}»` : ''}</strong>
                <div style={{ color: MPL.muted, fontSize: 13.5, marginTop: 2 }}>Encontrado el {day(f.foundAt)}</div>
                <div style={{ color: MPL.muted, fontSize: 13.5, display: 'flex', gap: 5, alignItems: 'center' }}><MapPin size={13} style={{ flex: 'none' }} /> {f.foundPlace}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function FoundDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { openAuth } = useAuthModal();
  const q = useQuery({ queryKey: ['found-public', id], queryFn: () => getFound(id) });
  const [busy, setBusy] = useState(false);
  const f = q.data;
  const claim = async () => {
    if (!user) { openAuth({ mode: 'login', message: 'Entra para escribir a quien lo encontró.' }); return; }
    setBusy(true);
    try { const { conversationId } = await claimFound(id); nav(`/mensajes/${conversationId}`); }
    catch (e) { toast.error(foundError(e)); setBusy(false); }
  };
  if (q.isLoading) return <div style={{ padding: 24, color: MPL.muted }}>Cargando…</div>;
  if (!f) return <div style={{ padding: 24 }}>Este animal ya no está publicado. <Link to="/encontrados">Ver encontrados</Link></div>;
  return (
    <div style={{ display: 'grid', gap: 16, padding: 'clamp(14px, 4vw, 24px)', maxWidth: 720 }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {f.images.map(src => <img key={src} src={toAbsoluteUrl(src)} alt="" style={{ height: 260, borderRadius: 18, objectFit: 'cover', flex: 'none', maxWidth: '100%' }} />)}
      </div>
      <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 30, fontWeight: 800, margin: 0 }}>{speciesLabel(f.species)} encontrado{f.name ? ` · «${f.name}»` : ''}</h1>
      <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 16, padding: 16, display: 'grid', gap: 6, fontSize: 15 }}>
        <div><strong>Cuándo:</strong> {day(f.foundAt)}</div>
        <div><strong>Dónde:</strong> {f.foundPlace}{f.city ? ` (${f.city})` : ''}</div>
        {f.approxAge && <div><strong>Edad aproximada:</strong> {f.approxAge}</div>}
        {f.description && <div style={{ color: MPL.muted }}>{f.description}</div>}
        <div style={{ color: MPL.muted, fontSize: 13.5 }}>Lo cuida {f.finderName || 'un particular'} mientras busca a su familia.</div>
      </div>
      {f.mine ? (
        <Link to={`/buscar-casa/encontrado/${f._id}`} style={{ justifySelf: 'start', background: MPL.teal, color: '#fff', borderRadius: 14, padding: '12px 18px', fontWeight: 800, textDecoration: 'none' }}>Ver los pasos</Link>
      ) : (
        <button type="button" onClick={claim} disabled={busy} style={{ justifySelf: 'start', background: MPL.coral, color: '#fff', border: 0, borderRadius: 14, padding: '13px 20px', font: 'inherit', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
          {busy ? 'Abriendo…' : 'Es mío'}
        </button>
      )}
      {!f.mine && <p style={{ color: MPL.muted, fontSize: 13.5, margin: 0 }}>Se abre una conversación con quien lo encontró. Ten a mano fotos o algún detalle que solo conozca su familia.</p>}
    </div>
  );
}
