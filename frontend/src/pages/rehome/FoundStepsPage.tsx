import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { closeFound, foundError, getFound, listFosterShelters, requestFoster, updateFoundSteps } from '../../api/found';
import { MPL, MPL_FONT_DISPLAY, speciesLabel } from '../../styles/mypetlive';
import { toAbsoluteUrl } from '../../utils/media';

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long' }) : '');
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 16 };
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '10px 12px', font: 'inherit', fontSize: 16, background: '#fff', color: MPL.ink };
const btn = (primary = false): React.CSSProperties => ({ border: primary ? 0 : `1.5px solid ${MPL.border}`, background: primary ? MPL.teal : '#fff', color: primary ? '#fff' : MPL.ink, borderRadius: 12, padding: '9px 14px', font: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex' });

function Step({ n, done, now, title, children }: { n: number; done: boolean; now?: boolean; title: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: n > 1 ? `1px solid ${MPL.border}` : 0 }}>
      <span style={{ width: 30, height: 30, borderRadius: 999, flex: 'none', display: 'grid', placeItems: 'center', fontWeight: 800, background: done ? MPL.teal : now ? MPL.gold : MPL.panel, color: done || now ? '#fff' : MPL.muted }}>{done ? '✓' : n}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6 }}>
        <strong style={{ fontSize: 15.5 }}>{title}</strong>
        {children}
      </div>
    </div>
  );
}

/** Pasos de «Lo he encontrado»: chip, ayuntamiento, 7 días y pedir ayuda a una protectora. */
export default function FoundStepsPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['found', id], queryFn: () => getFound(id) });
  const sheltersQ = useQuery({ queryKey: ['foster-shelters'], queryFn: listFosterShelters });
  const [vetName, setVetName] = useState('');
  const [who, setWho] = useState('');
  const [shelterId, setShelterId] = useState('');
  const [intent, setIntent] = useState<'find_home' | 'keep'>('find_home');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const f = q.data;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await q.refetch(); } catch (e) { toast.error(foundError(e)); } finally { setBusy(false); }
  };

  if (q.isLoading) return <div style={{ padding: 24, color: MPL.muted }}>Cargando…</div>;
  if (!f || !f.mine) return <div style={{ padding: 24 }}>No encontramos este animal. <Link to="/buscar-casa">Volver</Link></div>;

  const closed = ['reunido', 'retirado'].includes(f.status);
  const chipDone = f.chip?.result === 'none';
  const councilDone = Boolean(f.council?.at);
  const waitDone = !(f.blockers || []).includes('wait');
  const canAsk = f.status === 'buscando' && chipDone && councilDone && waitDone;
  const shelters = sheltersQ.data || [];

  return (
    <div style={{ display: 'grid', gap: 16, padding: 'clamp(14px, 4vw, 24px)', maxWidth: 640 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, overflow: 'hidden', background: MPL.panel, flex: 'none' }}>
          {f.images[0] && <img src={toAbsoluteUrl(f.images[0])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, margin: 0 }}>{f.name || `${speciesLabel(f.species)} encontrado`}</h1>
          <div style={{ color: MPL.muted, fontSize: 14 }}>Encontrado el {day(f.foundAt)} en {f.foundPlace}</div>
        </div>
      </div>

      {closed ? (
        <div style={{ ...card, background: MPL.teal100 }}>
          <strong>{f.status === 'reunido' ? (f.chip?.result === 'has_chip' ? 'Tiene chip: el veterinario avisa a su familia por el registro. ¡Bien hecho!' : '¡Ha vuelto con su familia!') : 'Ficha retirada.'}</strong>
        </div>
      ) : f.status === 'en_acogida' ? (
        <div style={{ ...card, background: MPL.teal100, display: 'grid', gap: 8 }}>
          <strong>Eres casa de acogida.</strong>
          <span style={{ fontSize: 14 }}>
            {f.foster?.intent === 'keep'
              ? 'La protectora tiene su adopción a tu nombre. Cuando lo registre y la apruebe, pasará a tu «Mi mascota».'
              : 'La protectora completará su ficha, la publicará y firmará su adopción. Tú lo cuidas hasta entonces.'}
          </span>
          <Link to={`/acogida/${f._id}`} style={btn()}>Ver el acuerdo</Link>
        </div>
      ) : (
        <>
          <p style={{ margin: 0, color: MPL.muted }}>Antes de buscarle casa, busquemos a su familia. Puede que lo estén buscando.</p>
          <div style={{ ...card, padding: '2px 16px' }}>
            <Step n={1} done={chipDone} now={!chipDone} title="Mirarle el chip en un veterinario">
              {chipDone ? <span style={{ color: MPL.muted, fontSize: 13.5 }}>{f.chip?.vetName ? `${f.chip.vetName}, ` : ''}{day(f.chip?.at)}: no tiene chip.</span> : (
                <>
                  <span style={{ color: MPL.muted, fontSize: 13.5 }}>Cualquier veterinario lo lee gratis en un momento. Si tiene chip, él avisa a su familia.</span>
                  <input value={vetName} onChange={e => setVetName(e.target.value)} placeholder="Clínica donde lo miraron" style={field} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" disabled={busy} style={btn(true)} onClick={() => run(() => updateFoundSteps(id, { chip: { result: 'none', vetName } }), 'Apuntado: no tiene chip')}>No tiene chip</button>
                    <button type="button" disabled={busy} style={btn()} onClick={() => { if (window.confirm('Si tiene chip, el veterinario avisa a su familia y aquí se cierra el caso. ¿Seguro?')) void run(() => updateFoundSteps(id, { chip: { result: 'has_chip', vetName } }), 'Cerrado: su familia está localizada'); }}>Tiene chip</button>
                    <Link to="/citas" style={btn()}>Pedir cita a un veterinario</Link>
                  </div>
                </>
              )}
            </Step>
            <Step n={2} done={councilDone} now={chipDone && !councilDone} title="Avisar al ayuntamiento o a la Policía Local">
              {councilDone ? <span style={{ color: MPL.muted, fontSize: 13.5 }}>{f.council?.who}, {day(f.council?.at)}.</span> : (
                <>
                  <span style={{ color: MPL.muted, fontSize: 13.5 }}>Recoger animales perdidos o abandonados le toca al ayuntamiento (Ley 7/2023, art. 22.1). Diles que lo tienes tú.</span>
                  <input value={who} onChange={e => setWho(e.target.value)} placeholder="Policía Local de Oleiros" style={field} />
                  <button type="button" disabled={busy || !who.trim()} style={{ ...btn(true), justifySelf: 'start' }} onClick={() => run(() => updateFoundSteps(id, { council: { who } }), 'Apuntado')}>Ya les he avisado</button>
                </>
              )}
            </Step>
            <Step n={3} done={waitDone} now={chipDone && councilDone && !waitDone} title="Una semana como «encontrado»">
              <span style={{ color: MPL.muted, fontSize: 13.5 }}>
                {waitDone ? 'Ya ha pasado una semana publicada.' : `Su ficha está en «Animales encontrados» desde el ${day(f.publishedAt)}. Podrás pedir ayuda a una protectora a partir del ${day(f.readyAt)}.`}
              </span>
              <Link to={`/encontrados/${f._id}`} style={{ ...btn(), justifySelf: 'start' }}>Ver su ficha pública</Link>
            </Step>
            <Step n={4} done={f.status === 'acogida_pedida'} now={canAsk} title="Pedir ayuda a una protectora">
              {f.status === 'acogida_pedida' ? (
                <span style={{ color: MPL.muted, fontSize: 13.5 }}>Pedido el {day(f.foster?.requestedAt)}. La protectora te responde en Mensajes. <Link to="/mensajes">Ir a Mensajes</Link></span>
              ) : !canAsk ? (
                <span style={{ color: MPL.muted, fontSize: 13.5 }}>Se abre cuando completes los pasos anteriores.</span>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <span style={{ color: MPL.muted, fontSize: 13.5 }}>No tienes que llevárselo: sigue en tu casa como casa de acogida. La protectora le pone el chip a su nombre y firma la adopción.</span>
                  {f.foster?.rejectedAt && <span style={{ color: MPL.coralDark, fontSize: 13.5 }}>La protectora anterior no pudo. Prueba con otra.</span>}
                  <div style={{ display: 'grid', gap: 6 }}>
                    <strong style={{ fontSize: 14 }}>¿Qué quieres?</strong>
                    {([['find_home', 'Buscarle una familia', 'La protectora publica su ficha y elige familia. Tú lo cuidas hasta entonces.'], ['keep', 'Quedármelo yo', 'La protectora lo registra y te lo da en adopción a ti.']] as const).map(([v, t, d]) => (
                      <label key={v} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: `1.5px solid ${intent === v ? MPL.teal : MPL.border}`, borderRadius: 12, padding: 10, cursor: 'pointer', background: '#fff' }}>
                        <input type="radio" checked={intent === v} onChange={() => setIntent(v)} style={{ marginTop: 3, accentColor: MPL.teal }} />
                        <span><strong style={{ display: 'block', fontSize: 14.5 }}>{t}</strong><span style={{ color: MPL.muted, fontSize: 13 }}>{d}</span></span>
                      </label>
                    ))}
                  </div>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13.5, fontWeight: 800 }}>Protectora
                    <select value={shelterId} onChange={e => setShelterId(e.target.value)} style={field}>
                      <option value="">Elige una protectora</option>
                      {shelters.map(s => <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ''}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13.5, fontWeight: 800 }}>Mensaje para la protectora
                    <textarea rows={3} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} style={{ ...field, resize: 'vertical' }} placeholder="Cómo está, qué come, si se lleva bien con otros animales…" />
                  </label>
                  <button type="button" disabled={busy || !shelterId} style={{ ...btn(true), justifySelf: 'start', background: MPL.coral }}
                    onClick={() => run(() => requestFoster(id, { shelterId, intent, message }), 'Enviado. Te responderán en Mensajes.')}>Pedir ayuda</button>
                  <span style={{ color: MPL.muted, fontSize: 12.5 }}>Si ninguna protectora puede, recuerda que el ayuntamiento está obligado a recogerlo (Ley 7/2023, art. 22.1).</span>
                </div>
              )}
            </Step>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={btn()} disabled={busy || f.status !== 'buscando'} onClick={() => { if (window.confirm('¿Ha vuelto con su familia? Se cierra la ficha.')) void run(() => closeFound(id, 'reunido'), '¡Qué bien!'); }}>Ha aparecido su familia</button>
            <button type="button" style={btn()} disabled={busy || f.status !== 'buscando'} onClick={() => { if (window.confirm('¿Retirar la ficha?')) void run(() => closeFound(id, 'retirado'), 'Ficha retirada'); }}>Retirar la ficha</button>
          </div>
        </>
      )}
    </div>
  );
}
