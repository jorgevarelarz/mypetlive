import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { getCessionContract, markTitleChanged, rehomeError, signCessionContract } from '../../api/rehome';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

const when = (iso: string) => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Contrato de cesión gratuita: leer, firmar (nombre y apellidos) e imprimir. */
export default function ContractPage() {
  const { adoptionId = '' } = useParams();
  const q = useQuery({ queryKey: ['cession-contract', adoptionId], queryFn: () => getCessionContract(adoptionId) });
  const [fullName, setFullName] = useState('');
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = q.data;

  const sign = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await signCessionContract(adoptionId, fullName);
      toast.success(r.completed ? '¡Contrato firmado por los dos!' : 'Firmado. Falta la otra firma.');
      await q.refetch();
    } catch (err) {
      toast.error(rehomeError(err, 'No se pudo firmar'));
    } finally {
      setBusy(false);
    }
  };

  const titleDone = async () => {
    try { await markTitleChanged(adoptionId); toast.success('Apuntado'); await q.refetch(); } catch (err) { toast.error(rehomeError(err)); }
  };

  if (q.isLoading) return <div style={{ padding: 24, color: MPL.muted }}>Cargando contrato…</div>;
  if (q.isError || !c) return <div style={{ padding: 24 }}>No encontramos este contrato. <Link to="/mensajes">Volver a Mensajes</Link></div>;

  return (
    <div style={{ display: 'grid', gap: 16, padding: 'clamp(14px, 4vw, 24px)', maxWidth: 720 }}>
      <style>{`@media print { .mpl-crumbs, header, nav, aside, .no-print { display: none !important; } }`}</style>
      <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, fontWeight: 800, margin: 0 }}>Contrato de cesión de {c.animal.name}</h1>
      {c.cancelledAt && <div style={{ background: MPL.coral100, color: MPL.coralDark, borderRadius: 12, padding: 12, fontWeight: 700 }}>Este contrato se anuló y no tiene validez.</div>}
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 15, lineHeight: 1.55, background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 16, padding: 20, margin: 0 }}>{c.text}</pre>

      <section style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 16, padding: 18, display: 'grid', gap: 8 }}>
        <strong>Firmas</strong>
        {(['from', 'to'] as const).map(who => {
          const s = c.signatures.find(x => x.who === who);
          const role = who === 'from' ? `Cede: ${c.fromName || ''}` : `Recibe: ${c.toName || ''}`;
          return (
            <div key={who} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14.5 }}>
              <span>{role}</span>
              <span style={{ color: s ? MPL.tealDark : MPL.muted, fontWeight: 700 }}>{s ? `✓ ${s.fullName} · ${when(s.at)}` : 'Pendiente'}</span>
            </div>
          );
        })}
      </section>

      {!c.signedByMe && !c.completedAt && !c.cancelledAt && (
        <form onSubmit={sign} className="no-print" style={{ background: '#fff', border: `1.5px solid ${MPL.teal}`, borderRadius: 16, padding: 18, display: 'grid', gap: 12 }}>
          <strong style={{ fontSize: 16 }}>Firmar</strong>
          <label style={{ display: 'grid', gap: 6, fontSize: 13.5, fontWeight: 800 }}>
            Tu nombre y apellidos
            <input value={fullName} onChange={e => setFullName(e.target.value)} required minLength={5} maxLength={120}
              style={{ border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 12px', font: 'inherit', fontSize: 16 }} />
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, accentColor: MPL.teal }} />
            <span>He leído el contrato y lo firmo. Queda registrado mi nombre con la fecha y la hora.</span>
          </label>
          <button type="submit" disabled={busy || !read || fullName.trim().split(/\s+/).length < 2}
            style={{ background: MPL.teal, color: '#fff', border: 0, borderRadius: 14, padding: '13px 18px', font: 'inherit', fontWeight: 800, fontSize: 15.5, cursor: 'pointer', opacity: busy || !read ? .6 : 1 }}>
            {busy ? 'Firmando…' : 'Firmar el contrato'}
          </button>
        </form>
      )}

      {c.completedAt && (
        <section className="no-print" style={{ background: c.titleChangedAt ? MPL.teal100 : MPL.gold100, borderRadius: 16, padding: 16, display: 'grid', gap: 8 }}>
          {c.titleChangedAt ? (
            <strong style={{ color: MPL.tealDark }}>Cambio de titular del microchip hecho. Todo listo.</strong>
          ) : (
            <>
              <strong style={{ color: MPL.goldDark }}>Falta un paso: el cambio de titular del microchip</strong>
              <span style={{ fontSize: 14 }}>Lo hace cualquier veterinario en el registro de animales (en Galicia, el REGIAC). Llevad este contrato.</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link to="/citas" style={{ background: MPL.teal, color: '#fff', borderRadius: 12, padding: '9px 14px', fontWeight: 800, textDecoration: 'none' }}>Pedir cita al veterinario</Link>
                {c.role === 'from' && <button type="button" onClick={titleDone} style={{ border: `1.5px solid ${MPL.border}`, background: '#fff', borderRadius: 12, padding: '9px 14px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>Ya está hecho</button>}
              </div>
            </>
          )}
        </section>
      )}

      <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => window.print()} style={{ border: `1.5px solid ${MPL.border}`, background: '#fff', borderRadius: 12, padding: '9px 14px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>Imprimir o guardar en PDF</button>
        <Link to="/mensajes" style={{ alignSelf: 'center', color: MPL.tealDark, fontWeight: 800, textDecoration: 'none' }}>Volver a Mensajes</Link>
      </div>
    </div>
  );
}
