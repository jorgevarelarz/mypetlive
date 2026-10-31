import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';
import { X } from 'lucide-react';
import { proposeAdoptionVisit } from '../../api/adoptions';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

const ERRORS: Record<string, string> = {
  date_in_past: 'Esa fecha ya ha pasado.',
  date_too_far: 'Elige una fecha dentro del próximo año.',
  invalid_date: 'Indica día y hora.',
  adoption_already_closed: 'Esta solicitud ya está cerrada.',
  invalid_transition: 'En este punto de la solicitud no se puede proponer visita.',
};

/** La protectora propone (o cambia) la visita para conocer al animal. */
export default function ProposeVisitDialog({
  adoptionId,
  animalName,
  initial,
  onClose,
  onDone,
}: {
  adoptionId: string;
  animalName?: string;
  initial?: { place?: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [day, setDay] = useState('');
  const [time, setTime] = useState('11:00');
  const [place, setPlace] = useState(initial?.place || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!day || !time) return toast.error('Indica día y hora.');
    setBusy(true);
    try {
      // La fecha se escribe en hora local del navegador (España); se manda en ISO.
      await proposeAdoptionVisit(adoptionId, { at: new Date(`${day}T${time}`).toISOString(), place: place.trim() || undefined, note: note.trim() || undefined });
      toast.success('Visita propuesta');
      onDone();
    } catch (err: any) {
      toast.error(ERRORS[err?.response?.data?.error] || 'No se pudo proponer la visita');
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 12px', font: 'inherit', fontSize: 16, background: '#fff', color: MPL.ink };
  const label: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 13.5, fontWeight: 800, color: MPL.ink };
  const today = new Date().toLocaleDateString('en-CA');

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Proponer visita" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(63,74,60,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} className="safe-bottom"
        style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: '22px 22px 0 0', padding: '20px 20px 26px', display: 'grid', gap: 14, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 21, fontWeight: 800, margin: 0, flex: 1 }}>
            Visita para conocer a {animalName || 'el animal'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ padding: 6, border: 0, background: 'none', cursor: 'pointer', color: MPL.ink }}><X size={20} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
          <label style={label}>Día<input type="date" required min={today} value={day} onChange={e => setDay(e.target.value)} style={field} /></label>
          <label style={label}>Hora<input type="time" required value={time} onChange={e => setTime(e.target.value)} style={field} /></label>
        </div>
        <label style={label}>Lugar<input value={place} maxLength={200} onChange={e => setPlace(e.target.value)} placeholder="Dirección del refugio o punto de encuentro" style={field} /></label>
        <label style={label}>Nota (opcional)<textarea value={note} maxLength={500} rows={2} onChange={e => setNote(e.target.value)} placeholder="Qué traer, cómo llegar…" style={{ ...field, resize: 'vertical' }} /></label>
        <p style={{ margin: 0, fontSize: 13, color: MPL.muted }}>
          Sale en el chat y en Citas. La solicitud pasa a «cita propuesta» y el animal queda reservado.
        </p>
        <button type="submit" disabled={busy}
          style={{ background: MPL.coral, color: '#fff', border: 0, borderRadius: 14, padding: '13px 18px', font: 'inherit', fontWeight: 800, fontSize: 15.5, cursor: 'pointer', opacity: busy ? .7 : 1 }}>
          {busy ? 'Enviando…' : 'Proponer visita'}
        </button>
      </form>
    </div>,
    document.body,
  );
}
