import React from 'react';
import { WALK_KIND_OPTIONS } from '../../styles/mypetlive';

export type WalkDraft = { kind: string; minutes?: number; distanceKm?: number; place?: string };

type Props = {
  open: boolean;
  busy?: boolean;
  petName?: string;
  onCancel: () => void;
  onConfirm: (walk: WalkDraft) => void;
};

const MUTED = '#7A8273';

/**
 * Formulario de paseo. Vive aparte porque se abre desde dos sitios —la ficha de
 * la mascota y la home— y duplicarlo garantizaba que acabaran divergiendo.
 *
 * El tipo es lo único obligatorio: es lo que siempre se sabe y lo que da sentido
 * al resto. Minutos, distancia y lugar pueden faltar.
 */
export default function WalkSheet({ open, busy, petName, onCancel, onConfirm }: Props) {
  const [kind, setKind] = React.useState('');
  const [minutes, setMinutes] = React.useState('');
  const [distanceKm, setDistanceKm] = React.useState('');
  const [place, setPlace] = React.useState('');

  // Cada apertura empieza en blanco: el paseo de ayer no es el borrador de hoy.
  React.useEffect(() => {
    if (open) {
      setKind('');
      setMinutes('');
      setDistanceKm('');
      setPlace('');
    }
  }, [open]);

  if (!open) return null;

  const confirm = () => {
    if (!kind) return;
    onConfirm({
      kind,
      minutes: minutes ? Number(minutes.replace(',', '.')) : undefined,
      distanceKm: distanceKm ? Number(distanceKm.replace(',', '.')) : undefined,
      place: place.trim() || undefined,
    });
  };

  return (
    <div style={backdrop} onClick={() => !busy && onCancel()}>
      <div role="dialog" aria-modal="true" aria-label="Marcar paseo" style={modal} onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Marcar paseo</h3>
        <p className="text-sm" style={{ color: MUTED, marginTop: 4 }}>
          ¿Cómo ha sido el paseo{petName ? ` de ${petName}` : ''}?
        </p>

        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', marginTop: 8 }}>
          {WALK_KIND_OPTIONS.map(option => {
            const active = kind === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                aria-pressed={active}
                className="border text-left p-3"
                style={{
                  borderRadius: 12,
                  borderColor: active ? '#1F6F6F' : '#E7E1D5',
                  background: active ? '#EEF7F6' : '#FFFFFF',
                  boxShadow: active ? 'inset 0 0 0 1px #1F6F6F' : 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 20, lineHeight: 1.2 }}>{option.icon}</div>
                <div className="text-sm font-semibold">{option.label}</div>
                <div className="text-xs" style={{ color: MUTED }}>{option.hint}</div>
              </button>
            );
          })}
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
          <Field label="Minutos" value={minutes} onChange={setMinutes} numeric placeholder="45" />
          <Field label="Kilómetros" value={distanceKm} onChange={setDistanceKm} numeric placeholder="3,2" />
        </div>
        <Field label="Dónde" value={place} onChange={setPlace} placeholder="Parque de Santa Margarita" />

        <p className="text-xs" style={{ color: MUTED, marginTop: 8 }}>
          Solo el tipo es obligatorio: un paseo registrado a medias vale más que un paseo sin registrar.
        </p>

        <div className="flex flex-wrap justify-end gap-2" style={{ marginTop: 16 }}>
          <button type="button" onClick={onCancel} disabled={busy} style={btnGhost}>Cancelar</button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !kind}
            style={{ ...btnPrimary, opacity: busy || !kind ? 0.5 : 1 }}
          >
            {busy ? 'Guardando…' : 'Marcar paseo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, numeric, placeholder }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean; placeholder?: string }) {
  return (
    <label className="text-sm" style={{ display: 'block', marginTop: 8 }}>
      <span style={{ color: MUTED }}>{label}</span>
      <input
        // `inputMode` y no `type="number"`: en móvil abre el teclado numérico sin
        // romper la coma decimal, que es como se escribe aquí.
        inputMode={numeric ? 'decimal' : undefined}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border px-3 py-2 text-sm"
        style={{ borderRadius: 8, borderColor: '#D7D0C2', marginTop: 4 }}
      />
    </label>
  );
}

const btnPrimary: React.CSSProperties = {
  background: '#1F6F6F', color: '#FFFFFF', border: 'none', borderRadius: 10,
  padding: '10px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

const btnGhost: React.CSSProperties = {
  background: '#FFFFFF', color: '#3F4A3C', border: '1px solid #D7D0C2', borderRadius: 10,
  padding: '10px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 2000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};

const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 20, width: 'min(460px, 96vw)',
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 45px rgba(15,23,42,0.25)',
};
