import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { foundError, getFosterAgreement, signFosterAgreement } from '../../api/found';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

/** Acuerdo de casa de acogida: lo acepta la protectora y lo firma quien encontró el animal. */
export default function FosterAgreementPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['foster-agreement', id], queryFn: () => getFosterAgreement(id) });
  const [fullName, setFullName] = useState('');
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const a = q.data;

  const sign = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await signFosterAgreement(id, fullName); toast.success('Firmado. Ya eres casa de acogida.'); await q.refetch(); }
    catch (err) { toast.error(foundError(err, 'No se pudo firmar')); } finally { setBusy(false); }
  };

  if (q.isLoading) return <div style={{ padding: 24, color: MPL.muted }}>Cargando…</div>;
  if (!a) return <div style={{ padding: 24 }}>No encontramos este acuerdo. <Link to="/mensajes">Volver a Mensajes</Link></div>;
  const signed = a.signatures[0];

  return (
    <div style={{ display: 'grid', gap: 16, padding: 'clamp(14px, 4vw, 24px)', maxWidth: 720 }}>
      <style>{`@media print { .mpl-crumbs, header, nav, aside, .no-print { display: none !important; } }`}</style>
      <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, fontWeight: 800, margin: 0 }}>Acuerdo de casa de acogida{a.name ? ` de ${a.name}` : ''}</h1>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 15, lineHeight: 1.55, background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 16, padding: 20, margin: 0 }}>{a.text}</pre>
      <section style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 16, padding: 18, fontSize: 14.5, display: 'grid', gap: 6 }}>
        <div>Protectora: <strong style={{ color: MPL.tealDark }}>✓ aceptado</strong></div>
        <div>Casa de acogida: {signed ? <strong style={{ color: MPL.tealDark }}>✓ {signed.fullName}</strong> : <span style={{ color: MPL.muted }}>pendiente</span>}</div>
      </section>
      {a.role === 'finder' && !signed && (
        <form onSubmit={sign} className="no-print" style={{ background: '#fff', border: `1.5px solid ${MPL.teal}`, borderRadius: 16, padding: 18, display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13.5, fontWeight: 800 }}>Tu nombre y apellidos
            <input value={fullName} onChange={e => setFullName(e.target.value)} required minLength={5} maxLength={120} style={{ border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 12px', font: 'inherit', fontSize: 16 }} />
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, accentColor: MPL.teal }} />
            <span>He leído el acuerdo y lo firmo. Queda registrado mi nombre con la fecha y la hora.</span>
          </label>
          <button type="submit" disabled={busy || !read || fullName.trim().split(/\s+/).length < 2}
            style={{ background: MPL.teal, color: '#fff', border: 0, borderRadius: 14, padding: '13px 18px', font: 'inherit', fontWeight: 800, fontSize: 15.5, cursor: 'pointer', opacity: busy || !read ? .6 : 1 }}>
            {busy ? 'Firmando…' : 'Firmar el acuerdo'}
          </button>
        </form>
      )}
      {signed && a.role === 'shelter' && (
        <Link className="no-print" to={a.status === 'en_acogida' ? '/landlord/animals' : '/mensajes'} style={{ justifySelf: 'start', background: MPL.teal, color: '#fff', borderRadius: 12, padding: '10px 16px', fontWeight: 800, textDecoration: 'none' }}>
          Ver en «Mis animales»
        </Link>
      )}
      <button type="button" className="no-print" onClick={() => window.print()} style={{ justifySelf: 'start', border: `1.5px solid ${MPL.border}`, background: '#fff', borderRadius: 12, padding: '9px 14px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>Imprimir o guardar en PDF</button>
    </div>
  );
}
