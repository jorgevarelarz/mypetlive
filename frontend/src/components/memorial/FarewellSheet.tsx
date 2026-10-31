import React from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

// Despedir a una mascota que ha fallecido. Sin prisa y sin letra pequeña: se
// dice qué va a pasar antes de pedir nada, y que se puede deshacer.

type Props = {
  petName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (diedAt?: string) => void;
};

const POINTS = [
  'Dejaremos de mandarte avisos de comida, paseos y vacunas.',
  'Su ficha se convierte en un mural para sus fotos, recuerdos y cosas favoritas.',
  'Quien escanee su chapa verá el mural.',
  'Si ha sido un error, se puede deshacer.',
];

export default function FarewellSheet({ petName, busy, onCancel, onConfirm }: Props) {
  const [diedAt, setDiedAt] = React.useState('');
  const today = new Date().toISOString().slice(0, 10);

  return createPortal(
    <div
      onClick={() => !busy && onCancel()}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(20,24,20,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="farewell-title"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: '#fff', borderRadius: '24px 24px 0 0',
          padding: '26px 22px calc(26px + env(safe-area-inset-bottom))', fontFamily: MPL_FONT_BODY, color: MPL.ink,
          display: 'grid', gap: 16, maxHeight: '92vh', overflowY: 'auto',
        }}
      >
        <div>
          <h2 id="farewell-title" style={{ margin: 0, fontFamily: MPL_FONT_DISPLAY, fontWeight: 700, fontSize: 26 }}>
            Despedir a {petName}
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 16, lineHeight: 1.45 }}>
            Lo sentimos mucho. Gracias por cuidar tan bien de {petName} todos estos años.
          </p>
        </div>

        <label style={{ display: 'grid', gap: 6, fontSize: 15, fontWeight: 600 }}>
          ¿Cuándo os dejó?
          <input
            type="date"
            value={diedAt}
            max={today}
            onChange={e => setDiedAt(e.target.value)}
            style={{ height: 48, border: '1px solid #D7D0C2', borderRadius: 12, padding: '0 14px', font: 'inherit', fontWeight: 400, fontSize: 16, color: MPL.ink, background: '#fff', width: '100%', boxSizing: 'border-box' }}
          />
          <span style={{ fontWeight: 400, fontSize: 13, color: MPL.muted }}>Si no quieres ponerla, déjalo en blanco.</span>
        </label>

        <div style={{ display: 'grid', gap: 10, fontSize: 15, lineHeight: 1.4 }}>
          {POINTS.map(text => (
            <div key={text} style={{ display: 'flex', gap: 10 }}>
              <Check size={20} color={MPL.teal} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
              <span>{text}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => onConfirm(diedAt || undefined)}
            disabled={busy}
            style={{ height: 52, borderRadius: 14, border: 0, background: MPL.teal, color: '#fff', font: 'inherit', fontWeight: 700, fontSize: 16, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'Un momento…' : 'Crear su mural'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{ height: 44, borderRadius: 14, border: 0, background: 'transparent', color: MPL.muted, font: 'inherit', fontWeight: 600, fontSize: 15 }}
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
