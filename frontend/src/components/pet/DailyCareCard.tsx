import React from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { CalcoCalendarioHuella, CalcoCheck, CalcoComida, CalcoComidaTachada, CalcoHuellaDeco, CalcoPaseo, CalcoPasos } from '../icons/calcados';
import { M } from './maqueta';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  getAnimalCare,
  markAnimalFeeding,
  markAnimalLitter,
  markAnimalWalk,
  type CareEntry,
  type CareSupply,
} from '../../api/animals';
import SupplyList from './SupplyList';
import ProductSuggestions from './ProductSuggestions';
import ScanButton from './ScanButton';
import { teachBarcode } from '../../api/animals';
import { describeSupply } from '../../utils/supplies';
import { usesLitter, usesWalks, walkKindLabel } from '../../styles/mypetlive';
import WalkSheet, { type WalkDraft } from './WalkSheet';

type Props = {
  animalId: string;
  species?: string;
  /** Para refrescar la home y la lista de mascotas, que cachean el mismo animal. */
  onMarked?: () => void;
  /** La despensa se gestiona en «Mi mascota»; en el inicio se oculta. */
  showPantry?: boolean;
  /** Versión del inicio: dos líneas de estado y los botones en una fila (maqueta del 2 nov 2026). */
  compact?: boolean;
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

export default function DailyCareCard({ animalId, species, onMarked, showPantry = true, compact = false }: Props) {
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
  // Código escaneado que nadie conocía: con el nombre que escriba se aprende.
  const [pendingCode, setPendingCode] = React.useState<string | null>(null);

  const showLitter = usesLitter(species);
  const showWalk = usesWalks(species);
  const pantry = data?.pantry || { foods: [], litters: [] };
  const summary = data?.summary;
  const items = data?.items || [];
  const lastOf = (type: CareEntry['type']) => items.find(e => e.type === type);

  const closeSheet = () => {
    setPendingCode(null);
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
    if (pendingCode) {
      void teachBarcode(pendingCode, value, sheet === 'litter' ? 'litter' : 'food', species).catch(() => undefined);
      setPendingCode(null);
    }
    if (sheet === 'feed') toggleFood(value);
    else setLitter(value);
    setCustom('');
  };

  const lastFeed = lastOf('feed');
  const lastLitter = lastOf('litter');
  const lastWalk = lastOf('walk');
  const today = (entry?: CareEntry | null) => !!entry && new Date(entry.createdAt).toDateString() === new Date().toDateString();
  const fedToday = today(lastFeed);
  const walkedToday = today(lastWalk);
  const headline = fedToday && (!showWalk || walkedToday)
    ? 'Hoy ya está todo apuntado.'
    : !fedToday && showWalk && !walkedToday
      ? 'Aún no registramos una comida ni un paseo hoy.'
      : !fedToday
        ? 'Aún no registramos una comida hoy.'
        : 'Aún no registramos un paseo hoy.';

  return (
    <div style={compact
      ? { position: 'relative', borderRadius: 16, background: M.tarjeta, boxShadow: M.sombra, border: '1px solid #F1EBE2', padding: '10px 15px 12px 20px', fontFamily: M.letra, letterSpacing: 0, color: M.tinta }
      : { position: 'relative', overflow: 'hidden', borderRadius: 14, background: M.tarjeta, boxShadow: M.sombra, border: '1px solid #F1EBE2', padding: '9px 10px 10px 10px', fontFamily: M.letra, letterSpacing: 0, color: M.tinta }}>
      {compact ? (
        // Inicio (maqueta): calendario de 25, título de 16,5, dos líneas de 11,5 y botones de 34 de alto.
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            <CalcoCalendarioHuella size={25} />
            <h2 style={{ margin: 0, fontFamily: M.titulos, fontSize: 16.5, fontWeight: 700, color: M.tinta }}>Cuidado diario</h2>
          </div>
          <div style={{ display: 'grid', gap: 9, margin: '10px 0 0 12px' }}>
            <CompactLine icon={<CalcoComidaTachada size={16} />} text={lastFeed ? `Comió ${since(lastFeed.createdAt)}` : 'Aún no registramos una comida'} />
            {showWalk && <CompactLine icon={<CalcoPasos size={16} />} text={lastWalk ? `Paseó ${since(lastWalk.createdAt)}` : 'Aún no registramos un paseo'} />}
            {showLitter && <CompactLine icon={<Sparkles size={15} color={M.verde} />} text={lastLitter ? `Arena cambiada ${since(lastLitter.createdAt)}` : 'Aún no registramos un cambio de arena'} />}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${1 + (showWalk ? 1 : 0) + (showLitter ? 1 : 0)}, minmax(0, 1fr))`, gap: 12, marginTop: 11, marginLeft: -10 }}>
            <button type="button" onClick={() => setSheet('feed')} style={{ ...compactButton, background: M.verdeBoton, color: '#FFFFFF', borderColor: M.verdeBoton, boxShadow: '0 4px 10px -6px rgba(14,95,91,.6)' }}>Marcar comida</button>
            {showWalk && <button type="button" onClick={() => setSheet('walk')} style={compactButton}>Marcar paseo</button>}
            {showLitter && <button type="button" onClick={() => setSheet('litter')} style={compactButton}>Cambiar arena</button>}
          </div>
        </>
      ) : (
        // Mi mascota (maqueta): calendario de 25, título de 13,5, caja interior con una fila de 38 por cuidado.
        <>
          <CalcoHuellaDeco size={31} style={{ position: 'absolute', top: 11, right: 10 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 44px 0 4px' }}>
            <CalcoCalendarioHuella size={25} />
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontFamily: M.titulos, fontSize: 13.5, lineHeight: '15px', fontWeight: 700, color: M.tinta }}>Cuidado diario</h2>
              <div style={{ fontSize: 10, lineHeight: '12px', color: '#3D4340', marginTop: 2 }}>{headline}</div>
            </div>
          </div>
          <div style={{ marginTop: 10, borderRadius: 12, background: '#FFFFFF', border: '1px solid #EFE9E0', boxShadow: '0 2px 6px -4px rgba(60,45,30,.2)', minWidth: 0 }}>
            <CareLine
              icon={<CalcoComida size={17} />}
              label="Comida"
              title={lastFeed ? `Comió ${since(lastFeed.createdAt)}` : 'Aún no registramos una comida'}
              detail={entryDetail(lastFeed)}
              actor={lastFeed?.actorName}
              aside={summary?.feedings ? `${summary.feedings} esta semana` : undefined}
              action={{ label: 'Marcar comida', primary: true, onClick: () => setSheet('feed') }}
              first
            />
            {showWalk && (
              <CareLine
                icon={<CalcoPaseo size={22} />}
                label="Paseo"
                title={lastWalk ? `Paseó ${since(lastWalk.createdAt)}` : 'Aún no registramos un paseo'}
                detail={entryDetail(lastWalk)}
                actor={lastWalk?.actorName}
                aside={summary?.walks ? `${summary.walks} esta semana${summary.walkKm ? ` · ${summary.walkKm} km` : ''}` : undefined}
                action={{ label: 'Marcar paseo', onClick: () => setSheet('walk') }}
              />
            )}
            {showLitter && (
              <CareLine
                icon={<Sparkles size={16} color={M.verde} />}
                label="Arena"
                title={lastLitter ? `Cambiada ${since(lastLitter.createdAt)}` : 'Aún no registramos un cambio de arena'}
                detail={entryDetail(lastLitter)}
                actor={lastLitter?.actorName}
                aside={summary?.litterChanges ? `${summary.litterChanges} esta semana` : undefined}
                action={{ label: 'Cambiar arena', onClick: () => setSheet('litter') }}
              />
            )}
          </div>
        </>
      )}

      {showPantry && (
        <SupplyList
          animalId={animalId}
          foods={pantry.foods}
          litters={pantry.litters}
          showLitter={showLitter}
          species={species}
          onChange={() => refetch()}
        />
      )}

      {(sheet === 'feed' || sheet === 'litter') && createPortal(
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
                        <Chip
                          key={food.name}
                          label={food.name}
                          hint={describeSupply(food, 'comidas')}
                          warn={food.runningLow}
                          active={foods.includes(food.name)}
                          onClick={() => toggleFood(food.name)}
                        />
                      ))}
                    </div>
                  </>
                )}
                {foods.filter(f => !pantry.foods.some(p => p.name === f)).map(food => (
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
                {foods.length < 2 && (
                  <ScanRow
                    pending={!!pendingCode}
                    onResult={r => {
                      if (r.name) { toggleFood(r.name); setPendingCode(null); }
                      else setPendingCode(r.code);
                    }}
                  />
                )}
                {foods.length < 2 && (
                  <ProductSuggestions
                    q={custom}
                    kind="food"
                    species={species}
                    exclude={foods}
                    onPick={name => { toggleFood(name); setCustom(''); }}
                  />
                )}
              </>
            )}

            {sheet === 'litter' && (
              <>
                <h3 className="text-lg font-semibold">Cambiar arena</h3>
                {pantry.litters.length > 0 && (
                  <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
                    {pantry.litters.map(type => (
                      <Chip
                        key={type.name}
                        label={type.name}
                        hint={describeSupply(type, 'cambios')}
                        warn={type.runningLow}
                        active={litter === type.name}
                        onClick={() => setLitter(litter === type.name ? '' : type.name)}
                      />
                    ))}
                  </div>
                )}
                {litter && !pantry.litters.some(p => p.name === litter) && (
                  <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
                    <Chip label={litter} active onClick={() => setLitter('')} />
                  </div>
                )}
                <CustomInput
                  placeholder={pantry.litters.length ? 'Otro tipo de arena…' : 'Qué arena usas (opcional)'}
                  value={custom}
                  onChange={setCustom}
                  onAdd={addCustom}
                />
                <ScanRow
                  pending={!!pendingCode}
                  onResult={r => {
                    if (r.name) { setLitter(r.name); setPendingCode(null); }
                    else setPendingCode(r.code);
                  }}
                />
                <ProductSuggestions
                  q={custom}
                  kind="litter"
                  species={species}
                  exclude={litter ? [litter] : []}
                  onPick={name => { setLitter(name); setCustom(''); }}
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
        </div>,
        document.body,
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

type CareAction = { label: string; primary?: boolean; onClick: () => void };

const compactButton: React.CSSProperties = {
  height: 34, borderRadius: 12, border: '1px solid #CFC9BF', background: '#FFFFFF', color: M.tinta,
  fontFamily: M.letra, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', padding: '0 6px',
};

function CompactLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, lineHeight: '16px', color: '#2F3532' }}>
      <span aria-hidden style={{ display: 'inline-flex', width: 17, justifyContent: 'center' }}>{icon}</span>
      <span style={{ minWidth: 0 }}>{text}</span>
    </div>
  );
}

// Fila de la maqueta: círculo de 28 con el icono, nombre (11) y estado (9), y botón de 120 × 25 a la derecha.
function CareLine({ icon, label, title, detail, actor, aside, action, first }: { icon: React.ReactNode; label: string; title: string; detail?: string | null; actor?: string; aside?: string; action: CareAction; first?: boolean }) {
  const extra = [detail || '', actor ? `marcado por ${actor}` : '', aside || ''].filter(Boolean).join(' · ');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', alignItems: 'center', columnGap: 10, minHeight: 38, padding: '4px 9px 4px 8px', borderTop: first ? 0 : '1px solid #EDE7DE' }}>
      <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, background: '#F5F1EB' }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, lineHeight: '13px', fontWeight: 700, color: M.tinta }}>{label}</div>
        <div style={{ fontSize: 9, lineHeight: '11px', color: '#4A504C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {!!extra && <div style={{ fontSize: 8.5, lineHeight: '10px', color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{extra}</div>}
      </div>
      <button
        type="button"
        onClick={action.onClick}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: 120, height: 25, padding: 0, borderRadius: 8,
          border: `1px solid ${action.primary ? M.verdeBoton : '#8FB7B2'}`, background: action.primary ? M.verdeBoton : '#FFFFFF',
          color: action.primary ? '#FFFFFF' : M.verdeBoton, fontFamily: M.letra, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer',
          boxShadow: action.primary ? '0 3px 8px -5px rgba(14,95,91,.7)' : 'none',
        }}
      >
        <CalcoCheck size={8} color={action.primary ? '#FFFFFF' : M.verdeBoton} /> {action.label}
      </button>
    </div>
  );
}

function Chip({ label, hint, warn, active, onClick }: { label: string; hint?: string | null; warn?: boolean; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="border px-3 py-2 text-sm text-left"
      style={{
        borderRadius: 999,
        borderColor: active ? '#1F6F6F' : warn ? '#C0512F' : '#D7D0C2',
        background: active ? '#1F6F6F' : '#FFFFFF',
        color: active ? '#FFFFFF' : '#3F4A3C',
      }}
    >
      <span>{label}</span>
      {/* Lo que queda va en el propio chip: es donde se decide qué darle. */}
      {!!hint && (
        <span
          className="text-xs"
          style={{ display: 'block', color: active ? 'rgba(255,255,255,.85)' : warn ? '#8F3827' : MUTED }}
        >
          {warn ? `⚠️ ${hint}` : hint}
        </span>
      )}
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

// Escanear el paquete. Si nadie conocía el código, se pide escribir el nombre
// una vez: con «Añadir» queda aprendido para todos.
function ScanRow({ pending, onResult }: { pending: boolean; onResult: React.ComponentProps<typeof ScanButton>['onResult'] }) {
  return (
    <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
      <ScanButton onResult={onResult} />
      {pending && (
        <span className="text-xs" style={{ color: '#8F3827' }}>
          No conocemos ese producto: escribe su nombre arriba y pulsa Añadir.
        </span>
      )}
    </div>
  );
}
