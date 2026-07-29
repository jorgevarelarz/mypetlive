import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { upsertAnimalSupply, type CareSupply, type SupplyUnit } from '../../api/animals';
import { describeSupply, formatQuantity, FOOD_UNITS, LITTER_UNITS } from '../../utils/supplies';
import { Link } from 'react-router-dom';

type Kind = 'food' | 'litter';

type Props = {
  animalId: string;
  foods: CareSupply[];
  litters: CareSupply[];
  showLitter: boolean;
  onChange: () => void;
};

const MUTED = '#7A8273';
const WARN = '#8F3827';

/**
 * Existencias de la despensa: cuánto queda de cada producto y para cuántos usos.
 *
 * Vive debajo de los botones de cuidado y no en una pantalla aparte porque la
 * pregunta ("¿queda pienso?") aparece justo cuando se va a dar de comer.
 */
export default function SupplyList({ animalId, foods, litters, showLitter, onChange }: Props) {
  const [editing, setEditing] = React.useState<null | { kind: Kind; supply?: CareSupply }>(null);

  const save = useMutation({
    mutationFn: (payload: Parameters<typeof upsertAnimalSupply>[1]) => upsertAnimalSupply(animalId, payload),
    onSuccess: () => {
      setEditing(null);
      onChange();
    },
    onError: (error: any) => {
      const code = error?.response?.data?.error;
      if (code === 'unit_mismatch') return toast.error('El paquete y la ración tienen que ir en la misma magnitud.');
      if (code === 'name_required') return toast.error('Ponle nombre al producto.');
      if (code === 'pack_size_required') return toast.error('Para reponer hace falta saber cuánto trae el paquete.');
      toast.error('No se pudo guardar el producto');
    },
  });

  const rows: Array<{ kind: Kind; supply: CareSupply }> = [
    ...foods.map(supply => ({ kind: 'food' as Kind, supply })),
    ...(showLitter ? litters.map(supply => ({ kind: 'litter' as Kind, supply })) : []),
  ];

  const tracked = rows.filter(r => r.supply.usesLeft !== null);

  return (
    <div style={{ borderTop: '1px solid #E7E1D5', paddingTop: 12 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Despensa</h3>
        <button
          type="button"
          onClick={() => setEditing({ kind: 'food' })}
          className="text-xs font-semibold"
          style={{ color: '#1F6F6F', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          + Añadir producto
        </button>
      </div>

      {tracked.length === 0 ? (
        <p className="text-xs" style={{ color: MUTED, marginTop: 6 }}>
          {rows.length === 0
            ? 'Apunta el pienso y la arena que usas y te diremos para cuántas comidas queda.'
            : 'Di cuánto trae el paquete y qué ración le pones, y te diremos para cuántas comidas queda.'}
        </p>
      ) : null}

      <div className="grid gap-2" style={{ marginTop: 8 }}>
        {rows.map(({ kind, supply }) => {
          const detail = describeSupply(supply, kind === 'food' ? 'comidas' : 'cambios');
          return (
            <div key={`${kind}-${supply.name}`} className="flex flex-wrap items-center justify-between gap-2">
              <div style={{ minWidth: 0 }}>
                <div className="text-sm">
                  {supply.name}
                  {supply.remaining !== undefined && (
                    <span style={{ color: MUTED }}> · queda {formatQuantity(supply.remaining, supply.unit)}</span>
                  )}
                </div>
                <div className="text-xs" style={{ color: supply.runningLow ? WARN : MUTED }}>
                  {detail ? (supply.runningLow ? `⚠️ Se está acabando: ${detail}` : `Para ${detail}`) : 'Sin cuenta de existencias'}
                </div>
              </div>
              <div className="flex gap-2">
                {!!supply.packSize && (
                  <button
                    type="button"
                    onClick={() => save.mutate({ kind, name: supply.name, refill: true })}
                    disabled={save.isPending}
                    className="text-xs font-semibold"
                    style={linkBtn}
                  >
                    Reponer
                  </button>
                )}
                {supply.runningLow && (
                  // El enlace aparece justo cuando hace falta comprar, que es la
                  // única razón por la que alguien mira esta lista.
                  <Link
                    to={`/comprar?producto=${encodeURIComponent(supply.name)}`}
                    className="text-xs font-semibold"
                    style={{ color: '#1F6F6F' }}
                  >
                    Dónde comprarlo
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setEditing({ kind, supply })}
                  className="text-xs font-semibold"
                  style={linkBtn}
                >
                  Editar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <SupplyForm
          kind={editing.kind}
          supply={editing.supply}
          busy={save.isPending}
          onCancel={() => setEditing(null)}
          onDelete={
            editing.supply
              ? () => save.mutate({ kind: editing.kind, name: editing.supply!.name, remove: true })
              : undefined
          }
          onSave={payload => save.mutate(payload)}
        />
      )}
    </div>
  );
}

function SupplyForm({
  kind: initialKind,
  supply,
  busy,
  onCancel,
  onDelete,
  onSave,
}: {
  kind: Kind;
  supply?: CareSupply;
  busy?: boolean;
  onCancel: () => void;
  onDelete?: () => void;
  onSave: (payload: Parameters<typeof upsertAnimalSupply>[1]) => void;
}) {
  const [kind, setKind] = React.useState<Kind>(initialKind);
  const [name, setName] = React.useState(supply?.name || '');
  // El formulario habla en la unidad grande, que es la de la etiqueta del saco;
  // la ración se escribe en la pequeña, que es la de la báscula de cocina.
  const units = kind === 'food' ? FOOD_UNITS : LITTER_UNITS;
  const [packUnit, setPackUnit] = React.useState<SupplyUnit>(kind === 'food' ? 'kg' : 'l');
  const [perUseUnit, setPerUseUnit] = React.useState<SupplyUnit>(kind === 'food' ? 'g' : 'l');
  const [packSize, setPackSize] = React.useState(
    supply?.packSize ? String(supply.packSize / (packUnitFactor(kind === 'food' ? 'kg' : 'l'))).replace('.', ',') : '',
  );
  const [perUse, setPerUse] = React.useState(
    supply?.perUse ? String(supply.perUse / packUnitFactor(kind === 'food' ? 'g' : 'l')).replace('.', ',') : '',
  );

  const num = (value: string) => {
    const parsed = Number(value.replace(',', '.'));
    return value.trim() && Number.isFinite(parsed) ? parsed : undefined;
  };

  return (
    <div style={backdrop} onClick={() => !busy && onCancel()}>
      <div role="dialog" aria-modal="true" style={modal} onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{supply ? 'Editar producto' : 'Añadir producto'}</h3>

        {!supply && (
          <div className="flex gap-2" style={{ marginTop: 10 }}>
            {(['food', 'litter'] as Kind[]).map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                aria-pressed={kind === option}
                className="border px-3 py-2 text-sm"
                style={{
                  borderRadius: 999,
                  borderColor: kind === option ? '#1F6F6F' : '#D7D0C2',
                  background: kind === option ? '#1F6F6F' : '#FFFFFF',
                  color: kind === option ? '#FFFFFF' : '#3F4A3C',
                  cursor: 'pointer',
                }}
              >
                {option === 'food' ? 'Comida' : 'Arena'}
              </button>
            ))}
          </div>
        )}

        <label className="text-sm" style={{ display: 'block', marginTop: 10 }}>
          <span style={{ color: MUTED }}>Producto</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={kind === 'food' ? 'Acana Adult' : 'Aglomerante'}
            disabled={!!supply}
            className="w-full border px-3 py-2 text-sm"
            style={{ borderRadius: 8, borderColor: '#D7D0C2', marginTop: 4 }}
          />
        </label>

        <AmountField
          label={kind === 'food' ? 'Trae el paquete' : 'Trae el saco'}
          value={packSize}
          onChange={setPackSize}
          unit={packUnit}
          onUnit={setPackUnit}
          units={units}
          placeholder={kind === 'food' ? '6' : '10'}
        />
        <AmountField
          label={kind === 'food' ? 'Ración por comida' : 'Gasto por cambio'}
          value={perUse}
          onChange={setPerUse}
          unit={perUseUnit}
          onUnit={setPerUseUnit}
          units={units}
          placeholder={kind === 'food' ? '80' : '4'}
        />

        <p className="text-xs" style={{ color: MUTED, marginTop: 8 }}>
          Con estos dos datos sabemos para cuántas {kind === 'food' ? 'comidas' : 'cambios'} queda. Puedes dejarlos en
          blanco: el producto seguirá estando para marcarlo de un toque.
        </p>

        <div className="flex flex-wrap justify-between gap-2" style={{ marginTop: 16 }}>
          <div>
            {!!onDelete && (
              <button type="button" onClick={onDelete} disabled={busy} style={{ ...btnGhost, color: WARN, borderColor: '#E3C4C0' }}>
                Quitar
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} disabled={busy} style={btnGhost}>Cancelar</button>
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() =>
                onSave({
                  kind,
                  name: name.trim(),
                  packSize: num(packSize),
                  packUnit,
                  perUse: num(perUse),
                  perUseUnit,
                })
              }
              style={{ ...btnPrimary, opacity: busy || !name.trim() ? 0.5 : 1 }}
            >
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AmountField({
  label, value, onChange, unit, onUnit, units, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: SupplyUnit;
  onUnit: (u: SupplyUnit) => void;
  units: SupplyUnit[];
  placeholder?: string;
}) {
  return (
    <label className="text-sm" style={{ display: 'block', marginTop: 10 }}>
      <span style={{ color: MUTED }}>{label}</span>
      <div className="flex gap-2" style={{ marginTop: 4 }}>
        <input
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="border px-3 py-2 text-sm"
          style={{ borderRadius: 8, borderColor: '#D7D0C2', flex: 1, minWidth: 0 }}
        />
        <select
          value={unit}
          onChange={e => onUnit(e.target.value as SupplyUnit)}
          className="border px-2 py-2 text-sm"
          style={{ borderRadius: 8, borderColor: '#D7D0C2' }}
        >
          {units.map(u => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>
    </label>
  );
}

/** Factor de la unidad respecto a su base, para poder editar lo ya guardado. */
function packUnitFactor(unit: SupplyUnit): number {
  return unit === 'kg' || unit === 'l' ? 1000 : 1;
}

const btnPrimary: React.CSSProperties = {
  background: '#1F6F6F', color: '#FFFFFF', border: 'none', borderRadius: 10,
  padding: '10px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

const btnGhost: React.CSSProperties = {
  background: '#FFFFFF', color: '#3F4A3C', border: '1px solid #D7D0C2', borderRadius: 10,
  padding: '10px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#1F6F6F', cursor: 'pointer', padding: 0,
};

const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 2000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};

const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 20, width: 'min(460px, 96vw)',
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 45px rgba(15,23,42,0.25)',
};
