import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  getAnimalCare,
  markAnimalFeeding,
  markAnimalLitter,
  markAnimalWalk,
  type CareEntry,
} from '../../api/animals';
import { usesLitter, usesWalks, walkKindLabel } from '../../styles/mypetlive';
import WalkSheet, { type WalkDraft } from './WalkSheet';

type Props = {
  animalId: string;
  species?: string;
  /** Para refrescar la home y la lista de mascotas, que cachean el mismo animal. */
  onMarked?: () => void;
};

const CARD: React.CSSProperties = { borderColor: '#E7E1D5', background: '#FFFFFF' };
const MUTED = '#7A8273';

function hoursAgo(value?: string) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return null;
  return (Date.now() - ts) / 36e5;
}

/** "hace 3 h", "hace 2 días": el dato útil es la distancia, no la fecha exacta. */
function since(value?: string) {
  const hours = hoursAgo(value);
  if (hours === null) return null;
  if (hours < 1) return 'hace un momento';
  if (hours < 24) return `hace ${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

/** Detalle de una entrada, en una línea. */
function entryDetail(entry?: CareEntry) {
  if (!entry) return null;
  if (entry.type === 'feed') return entry.foods?.length ? entry.foods.join(' + ') : null;
  if (entry.type === 'litter') return entry.litterType || null;
  const parts = [walkKindLabel(entry.walk?.kind)];
  if (entry.walk?.distanceKm) parts.push(`${entry.walk.distanceKm} km`);
  if (entry.walk?.minutes) parts.push(`${entry.walk.minutes} min`);
  if (entry.walk?.place) parts.push(entry.walk.place);
  return parts.join(' · ');
}

export default function DailyCareCard({ animalId, species, onMarked }: Props) {
  const queryClient = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ['animal-care', animalId],
    queryFn: () => getAnimalCare(animalId),
    enabled: !!animalId,
  });

  const [sheet, setSheet] = React.useState<null | 'feed' | 'litter' | 'walk'>(null);
  const [foods, setFoods] = React.useState<string[]>([]);
  const [litter, setLitter] = React.useState('');
  const [custom, setCustom] = React.useState('');

  const showLitter = usesLitter(species);
  const showWalk = usesWalks(species);
  const pantry = data?.pantry || { foods: [], litters: [] };
  const summary = data?.summary;
  const items = data?.items || [];
  const lastOf = (type: CareEntry['type']) => items.find(e => e.type === type);

  const closeSheet = () => {
    setSheet(null);
    setFoods([]);
    setLitter('');
    setCustom('');
  };

  const care = useMutation({
    mutationFn: async (draft?: WalkDraft) => {
      if (sheet === 'feed') return markAnimalFeeding(animalId, foods);
      if (sheet === 'litter') return markAnimalLitter(animalId, litter || undefined);
      return markAnimalWalk(animalId, draft!);
    },
    onSuccess: () => {
      toast.success(
        sheet === 'feed' ? 'Gracias por cuidar de él 🌿'
        : sheet === 'litter' ? 'Gracias por mantener su espacio limpio ✨'
        : '¡Paseo registrado! 🐾',
      );
      closeSheet();
      refetch();
      queryClient.invalidateQueries({ queryKey: ['my-pets'] });
      onMarked?.();
    },
    onError: (error: any) => {
      const code = error?.response?.data?.error;
      if (code === 'walk_not_applicable') return toast.error('Los paseos son cosa de perros.');
      if (code === 'litter_not_applicable') return toast.error('Un perro no usa arenero.');
      if (code === 'invalid_minutes') return toast.error('Esa duración no parece un paseo (máximo 24 h).');
      if (code === 'invalid_distance') return toast.error('Esa distancia no parece un paseo (máximo 100 km).');
      if (error?.response?.status === 403) return toast.error('No tienes permiso para registrar el cuidado de esta mascota');
      toast.error('No se pudo registrar el cuidado');
    },
  });

  const toggleFood = (value: string) => {
    setFoods(current => {
      if (current.includes(value)) return current.filter(f => f !== value);
      // Dos como mucho: es lo que se da de verdad (el pienso y una lata).
      return current.length >= 2 ? current : [...current, value];
    });
  };

  const addCustom = () => {
    const value = custom.trim();
    if (!value) return;
    if (sheet === 'feed') toggleFood(value);
    else setLitter(value);
    setCustom('');
  };

  const lastFeed = lastOf('feed');
  const lastLitter = lastOf('litter');
  const lastWalk = lastOf('walk');

  return (
    <div className="border rounded-2xl p-4 grid gap-3" style={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Cuidado diario</h2>
        {!!summary && (summary.feedings > 0 || summary.walks > 0 || summary.litterChanges > 0) && (
          <span className="text-xs" style={{ color: MUTED }}>Esta semana</span>
        )}
      </div>

      <CareLine
        icon="🍽"
        title={lastFeed ? `Comió ${since(lastFeed.createdAt)}` : 'Aún no registramos una comida'}
        detail={entryDetail(lastFeed)}
        actor={lastFeed?.actorName}
        aside={summary?.feedings ? `${summary.feedings} comida${summary.feedings === 1 ? '' : 's'}` : undefined}
      />

      {showWalk && (
        <CareLine
          icon="🐾"
          title={lastWalk ? `Paseó ${since(lastWalk.createdAt)}` : 'Aún no registramos un paseo'}
          detail={entryDetail(lastWalk)}
          actor={lastWalk?.actorName}
          aside={
            summary?.walks
              ? `${summary.walks} paseo${summary.walks === 1 ? '' : 's'}${summary.walkKm ? ` · ${summary.walkKm} km` : ''}`
              : undefined
          }
        />
      )}

      {showLitter && (
        <CareLine
          icon="🪴"
          title={
            lastLitter
              ? `Arena cambiada ${since(lastLitter.createdAt)}`
              : 'Aún no registramos un cambio de arena'
          }
          detail={entryDetail(lastLitter)}
          actor={lastLitter?.actorName}
          aside={summary?.litterChanges ? `${summary.litterChanges} cambio${summary.litterChanges === 1 ? '' : 's'}` : undefined}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setSheet('feed')} style={btnPrimary}>Marcar comida</button>
        {showWalk && <button type="button" onClick={() => setSheet('walk')} style={btnGhost}>Marcar paseo</button>}
        {showLitter && <button type="button" onClick={() => setSheet('litter')} style={btnGhost}>Cambiar arena</button>}
      </div>

      {(sheet === 'feed' || sheet === 'litter') && (
        <div style={backdrop} onClick={() => !care.isPending && closeSheet()}>
          <div role="dialog" aria-modal="true" style={modal} onClick={e => e.stopPropagation()}>
            {sheet === 'feed' && (
              <>
                <h3 className="text-lg font-semibold">Marcar comida</h3>
                {pantry.foods.length > 0 && (
                  <>
                    <p className="text-sm" style={{ color: MUTED, marginTop: 4 }}>Lo de siempre — puedes marcar hasta dos.</p>
                    <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
                      {pantry.foods.map(food => (
                        <Chip key={food} label={food} active={foods.includes(food)} onClick={() => toggleFood(food)} />
                      ))}
                    </div>
                  </>
                )}
                {foods.filter(f => !pantry.foods.includes(f)).map(food => (
                  <div key={food} style={{ marginTop: 8 }}>
                    <Chip label={food} active onClick={() => toggleFood(food)} />
                  </div>
                ))}
                <CustomInput
                  placeholder={pantry.foods.length ? 'Otro producto…' : 'Qué le has dado (opcional)'}
                  value={custom}
                  onChange={setCustom}
                  onAdd={addCustom}
                  disabled={foods.length >= 2}
                />
              </>
            )}

            {sheet === 'litter' && (
              <>
                <h3 className="text-lg font-semibold">Cambiar arena</h3>
                {pantry.litters.length > 0 && (
                  <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
                    {pantry.litters.map(type => (
                      <Chip key={type} label={type} active={litter === type} onClick={() => setLitter(litter === type ? '' : type)} />
                    ))}
                  </div>
                )}
                <CustomInput
                  placeholder={pantry.litters.length ? 'Otro tipo de arena…' : 'Qué arena usas (opcional)'}
                  value={custom}
                  onChange={setCustom}
                  onAdd={addCustom}
                />
              </>
            )}

            <div className="flex flex-wrap justify-end gap-2" style={{ marginTop: 16 }}>
              <button type="button" onClick={closeSheet} disabled={care.isPending} style={btnGhost}>Cancelar</button>
              <button
                type="button"
                onClick={() => care.mutate(undefined)}
                disabled={care.isPending}
                style={{ ...btnPrimary, opacity: care.isPending ? 0.5 : 1 }}
              >
                {care.isPending ? 'Guardando…' : 'Marcar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <WalkSheet
        open={sheet === 'walk'}
        busy={care.isPending}
        onCancel={closeSheet}
        onConfirm={draft => care.mutate(draft)}
      />
    </div>
  );
}

function CareLine({ icon, title, detail, actor, aside }: { icon: string; title: string; detail?: string | null; actor?: string; aside?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <span aria-hidden style={{ fontSize: 18, lineHeight: 1.3 }}>{icon}</span>
        <div>
          <div className="text-sm">{title}</div>
          {!!detail && <div className="text-sm" style={{ color: MUTED }}>{detail}</div>}
          {!!actor && <div className="text-xs" style={{ color: MUTED }}>marcado por {actor}</div>}
        </div>
      </div>
      {!!aside && <span className="text-xs whitespace-nowrap" style={{ color: MUTED }}>{aside}</span>}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="border px-3 py-2 text-sm"
      style={{
        borderRadius: 999,
        borderColor: active ? '#1F6F6F' : '#D7D0C2',
        background: active ? '#1F6F6F' : '#FFFFFF',
        color: active ? '#FFFFFF' : '#3F4A3C',
      }}
    >
      {label}
    </button>
  );
}

function CustomInput({ placeholder, value, onChange, onAdd, disabled }: { placeholder: string; value: string; onChange: (v: string) => void; onAdd: () => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2" style={{ marginTop: 10 }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onAdd();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="border px-3 py-2 text-sm"
        style={{ borderRadius: 8, borderColor: '#D7D0C2', flex: 1, minWidth: 0 }}
      />
      <button type="button" onClick={onAdd} disabled={disabled || !value.trim()} style={{ ...btnGhost, opacity: disabled || !value.trim() ? 0.5 : 1 }}>
        Añadir
      </button>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="text-sm" style={{ display: 'block', marginTop: 8 }}>
      <span style={{ color: MUTED }}>{label}</span>
      <input
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
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
