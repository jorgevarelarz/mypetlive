import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  chooseAdopter, getRehomeStatus, listMyRehome, rehomeError, rejectAdopter, withdrawRehome,
  type RehomeAnimal, type RehomeRequest,
} from '../../api/rehome';
import OpenChatButton from '../../components/chat/OpenChatButton';
import { MPL, MPL_FONT_DISPLAY, speciesLabel } from '../../styles/mypetlive';
import { listMyFound } from '../../api/found';
import { toAbsoluteUrl } from '../../utils/media';

// «Buscar casa a un animal»: solo para particulares que el admin ha activado.
// Primero la pregunta que decide el camino legal (¿es tuyo o lo has
// encontrado?); después, tus anuncios con las personas que los han pedido.

const OPEN = ['recibida', 'cuestionario_pendiente', 'en_revision', 'info_adicional', 'cita_propuesta'];

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 16 };
const btn = (primary = false): React.CSSProperties => ({
  border: primary ? 0 : `1.5px solid ${MPL.border}`, background: primary ? MPL.teal : '#fff', color: primary ? '#fff' : MPL.ink,
  borderRadius: 12, padding: '8px 14px', font: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
});

export function PathChooser() {
  const nav = useNavigate();
  const opt: React.CSSProperties = { display: 'flex', gap: 14, alignItems: 'center', textAlign: 'left', width: '100%', background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 18, padding: 16, font: 'inherit', color: MPL.ink, cursor: 'pointer' };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, margin: 0 }}>¿De quién es el animal?</h2>
      <p style={{ color: MPL.muted, margin: 0 }}>Según la respuesta, el camino es distinto.</p>
      <button type="button" style={opt} onClick={() => nav('/buscar-casa/nuevo')}>
        <span style={{ width: 48, height: 48, borderRadius: 14, background: MPL.teal100, display: 'grid', placeItems: 'center', fontSize: 24, flex: 'none' }}>🏠</span>
        <span><strong style={{ display: 'block', fontSize: 16 }}>Es mío</strong><span style={{ color: MPL.muted, fontSize: 13.5 }}>Por ejemplo, la camada de tu gata. Lo cedes gratis, con contrato.</span></span>
      </button>
      <button type="button" style={opt} onClick={() => nav('/buscar-casa/encontrado/nuevo')}>
        <span style={{ width: 48, height: 48, borderRadius: 14, background: MPL.gold100, display: 'grid', placeItems: 'center', fontSize: 24, flex: 'none' }}>🔎</span>
        <span><strong style={{ display: 'block', fontSize: 16 }}>Lo he encontrado</strong><span style={{ color: MPL.muted, fontSize: 13.5 }}>Primero buscamos a su familia. Si no aparece, una protectora lo registra sin llevárselo, y puedes quedártelo.</span></span>
      </button>
      <div style={{ ...card, fontSize: 13.5, color: MPL.muted }}>
        En ningún caso se puede cobrar por un animal. Si es una protectora quien lo da, se llama adopción; si lo das tú, es una cesión.
      </div>
    </div>
  );
}

function RequestRow({ r, animal, onDone }: { r: RehomeRequest; animal: RehomeAnimal; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onDone(); } catch (e) { toast.error(rehomeError(e)); } finally { setBusy(false); }
  };
  const isOpen = OPEN.includes(r.status);
  const closed = ['rechazada', 'cancelada'].includes(r.status);
  const label = r.status === 'preaprobada'
    ? `Elegida · contrato ${r.contract?.signatures ?? 0}/2 firmas`
    : r.status === 'aprobada'
      ? r.contract?.titleChangedAt ? 'Cedido · titular del chip cambiado' : 'Cedido · falta cambiar el titular del chip'
      : closed ? 'Cerrada' : 'Lo ha pedido';
  return (
    <div style={{ display: 'grid', gap: 8, padding: '12px 0', borderTop: `1px solid ${MPL.border}`, opacity: closed ? .55 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <strong>{r.adopterName}</strong>
        <span style={{ fontSize: 12.5, color: MPL.muted }}>{label}</span>
      </div>
      {!closed && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {isOpen && (
            <>
              <button type="button" disabled={busy || animal.tooYoung} style={btn(true)}
                title={animal.tooYoung ? 'Todavía no tiene 8 semanas' : undefined}
                onClick={() => { if (window.confirm(`¿Elegir a ${r.adopterName} para ${animal.name}? Se reserva el animal y se prepara el contrato.`)) void run(() => chooseAdopter(r.adoptionId), 'Elegida. Ya podéis firmar el contrato.'); }}>
                Elegir
              </button>
              <button type="button" disabled={busy} style={btn()}
                onClick={() => { if (window.confirm(`¿Rechazar la solicitud de ${r.adopterName}?`)) void run(() => rejectAdopter(r.adoptionId), 'Solicitud rechazada'); }}>
                Rechazar
              </button>
            </>
          )}
          {(r.status === 'preaprobada' || r.status === 'aprobada') && <Link to={`/contratos/${r.adoptionId}`} style={btn(r.status === 'preaprobada' && !r.contract?.signedByMe)}>{r.status === 'preaprobada' && !r.contract?.signedByMe ? 'Firmar contrato' : 'Ver contrato'}</Link>}
          {r.status === 'preaprobada' && (
            <button type="button" disabled={busy} style={btn()}
              onClick={() => { if (window.confirm(`¿Anular la elección de ${r.adopterName}? Se cancela el contrato y ${animal.name} vuelve a estar disponible.`)) void run(() => rejectAdopter(r.adoptionId), 'Anulada'); }}>
              Anular
            </button>
          )}
          <OpenChatButton kind="adoption" refId={r.adoptionId} label="Escribir" style={{ padding: '8px 14px', fontSize: 14 }} />
        </div>
      )}
    </div>
  );
}

function ListingCard({ a, onDone }: { a: RehomeAnimal; onDone: () => void }) {
  const photo = a.images?.[0];
  const open = a.requests.filter(r => !['rechazada', 'cancelada'].includes(r.status));
  const withdraw = async () => {
    if (!window.confirm(`¿Retirar el anuncio de ${a.name}? Se cerrarán las solicitudes que tenga.`)) return;
    try { await withdrawRehome(a._id); toast.success('Anuncio retirado'); onDone(); } catch (e) { toast.error(rehomeError(e)); }
  };
  const statusText = a.status === 'publicado' ? 'Publicado' : a.status === 'reservado' ? 'Reservado' : a.status === 'adoptado' ? 'Cedido' : a.status === 'no_disponible' ? 'Oculto' : 'Retirado';
  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, overflow: 'hidden', background: MPL.panel, flex: 'none' }}>
          {photo && <img src={toAbsoluteUrl(photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{a.name}</div>
          <div style={{ color: MPL.muted, fontSize: 13.5 }}>{speciesLabel(a.species)} · {statusText} · microchip ···· {a.cession.microchip.slice(-4)}</div>
          {a.tooYoung && a.availableFrom && (
            <div style={{ color: MPL.goldDark, fontSize: 13, marginTop: 2 }}>
              Podrás elegir familia a partir del {new Date(a.availableFrom).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} (8 semanas).
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <Link to={`/animals/${a._id}`} style={btn()}>Ver anuncio</Link>
        {['publicado', 'no_disponible'].includes(a.status) && <button type="button" style={btn()} onClick={withdraw}>Retirar anuncio</button>}
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>
          {open.length ? `Lo han pedido ${open.length === 1 ? '1 persona' : `${open.length} personas`}` : 'Todavía no lo ha pedido nadie'}
        </div>
        {a.requests.map(r => <RequestRow key={r.adoptionId} r={r} animal={a} onDone={onDone} />)}
      </div>
    </div>
  );
}

export default function RehomePage() {
  const qc = useQueryClient();
  const statusQ = useQuery({ queryKey: ['rehome-status'], queryFn: getRehomeStatus });
  const listQ = useQuery({ queryKey: ['rehome-mine'], queryFn: listMyRehome, enabled: statusQ.data === true });
  const foundQ = useQuery({ queryKey: ['found-mine'], queryFn: listMyFound, enabled: statusQ.data === true });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['rehome-mine'] }); };
  const items = listQ.data || [];
  const found = foundQ.data || [];
  const FOUND_STATUS: Record<string, string> = { buscando: 'Buscando a su familia', acogida_pedida: 'Ayuda pedida a una protectora', en_acogida: 'En acogida', reunido: 'Con su familia', retirado: 'Retirado' };

  return (
    <div style={{ display: 'grid', gap: 18, padding: 'clamp(14px, 4vw, 24px)', maxWidth: 720 }}>
      <header>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 30, fontWeight: 800, margin: 0 }}>Buscar casa a un animal</h1>
        <p style={{ color: MPL.muted, margin: '6px 0 0' }}>Publica un animal tuyo, elige familia entre quienes lo pidan y firmad el contrato de cesión.</p>
      </header>
      {statusQ.isLoading ? (
        <div style={{ color: MPL.muted }}>Cargando…</div>
      ) : !statusQ.data ? (
        <div style={card}>Esta opción solo está disponible para algunas cuentas. Si quieres usarla, escríbenos a info@mypetlive.es.</div>
      ) : listQ.isLoading || foundQ.isLoading ? (
        <div style={{ color: MPL.muted }}>Cargando…</div>
      ) : items.length === 0 && found.length === 0 ? (
        <PathChooser />
      ) : (
        <>
          <Link to="/buscar-casa/elegir" style={{ ...btn(true), justifySelf: 'start', background: MPL.coral, padding: '11px 18px' }}>Publicar otro animal</Link>
          {found.map(f => (
            <Link key={f._id} to={`/buscar-casa/encontrado/${f._id}`} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', color: MPL.ink, textDecoration: 'none' }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, overflow: 'hidden', background: MPL.panel, flex: 'none' }}>{f.images[0] && <img src={toAbsoluteUrl(f.images[0])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{f.name || `${speciesLabel(f.species)} encontrado`} <span style={{ fontSize: 12, color: MPL.goldDark, background: MPL.gold100, borderRadius: 999, padding: '2px 8px' }}>Encontrado</span></div>
                <div style={{ color: MPL.muted, fontSize: 13.5 }}>{FOUND_STATUS[f.status]}{f.blockers?.length && f.status === 'buscando' ? ' · faltan pasos' : ''}</div>
              </div>
              <span style={{ color: MPL.tealDark, fontWeight: 800 }}>›</span>
            </Link>
          ))}
          {items.map(a => <ListingCard key={a._id} a={a} onDone={refresh} />)}
        </>
      )}
    </div>
  );
}
