import React from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { getAnimalCare, updateCareReminders, type CareReminders } from '../../api/animals';
import { usesLitter, usesWalks } from '../../styles/mypetlive';
import { Sparkles } from 'lucide-react';
import { PET_COLORS } from './petArt';
import { CalcoAviso, CalcoCuenco, CalcoPerroDorado } from '../icons/calcados';
import { M } from './maqueta';

// Avisos de comida, paseo y arena. Cada mascota tiene los suyos.
//
// Tres maneras por cuidado: a unas horas fijas, «si se me olvida» (lo que hay
// por defecto y no pide configurar nada) o nada. El texto de la notificación lo
// pone el servidor (utils/careMessages): habla la mascota.

type Props = { animalId: string; species?: string; petName?: string };
type Mode = 'times' | 'auto' | 'off';
type Kind = 'feed' | 'walk' | 'litter';

const MUTED = '#7A8273';
const INK = '#3F4A3C';
const TEAL = '#1F6F6F';
const CARD: React.CSSProperties = { borderColor: '#E7E1D5', background: '#FFFFFF' };

const EMPTY: CareReminders = {
  feed: { off: false, times: [] },
  walk: { off: false, times: [] },
  litter: { off: false, everyDays: null, time: null },
};

const LABEL: Record<Kind, { icon: string; title: string; auto: string }> = {
  feed: { icon: '🍽️', title: 'Comida', auto: 'Si pasan más de 14 h sin apuntarla' },
  walk: { icon: '🦮', title: 'Paseos', auto: 'Si pasan más de 12 h sin apuntar uno' },
  litter: { icon: '🧹', title: 'Arena', auto: 'Si pasan más de 3 días sin cambiarla' },
};

function modeOf(kind: Kind, r: CareReminders): Mode {
  if (r[kind].off) return 'off';
  if (kind === 'litter') return r.litter.everyDays ? 'times' : 'auto';
  return (r[kind] as { times: string[] }).times.length ? 'times' : 'auto';
}

const joinTimes = (times: string[]) =>
  times.length <= 1 ? times[0] : `${times.slice(0, -1).join(', ')} y ${times[times.length - 1]}`;

function summary(kind: Kind, r: CareReminders): string {
  const mode = modeOf(kind, r);
  if (mode === 'off') return 'Sin avisos';
  if (mode === 'auto') return LABEL[kind].auto;
  if (kind === 'litter') {
    const days = r.litter.everyDays === 1 ? 'Cada día' : `Cada ${r.litter.everyDays} días`;
    return `${days} a las ${r.litter.time || '19:00'}`;
  }
  return `A las ${joinTimes((r[kind] as { times: string[] }).times)}`;
}

export default function CareRemindersCard({ animalId, species, petName }: Props) {
  const queryClient = useQueryClient();
  const careQ = useQuery({
    queryKey: ['animal-care', animalId],
    queryFn: () => getAnimalCare(animalId),
    enabled: Boolean(animalId),
  });
  const saved = careQ.data?.reminders || EMPTY;
  const kinds: Kind[] = ['feed', ...(usesWalks(species) ? ['walk' as Kind] : []), ...(usesLitter(species) ? ['litter' as Kind] : [])];

  const [editing, setEditing] = React.useState<Kind | null>(null);

  const save = useMutation({
    mutationFn: (next: CareReminders) => updateCareReminders(animalId, next),
    onSuccess: data => {
      queryClient.setQueryData(['animal-care', animalId], (old: any) => (old ? { ...old, reminders: data.reminders } : old));
      setEditing(null);
      toast.success('Avisos guardados');
    },
    onError: () => toast.error('No se han podido guardar. Inténtalo de nuevo.'),
  });

  if (!animalId || careQ.isLoading) return null;

  return (
    // Maqueta: campana de 20, título de 13,5 y dos tarjetas de 44 de alto lado a lado.
    <div style={{ borderRadius: 14, background: M.tarjeta, boxShadow: M.sombra, border: '1px solid #F1EBE2', padding: '8px 10px 10px 10px', fontFamily: M.letra, letterSpacing: 0, color: M.tinta }}>
      <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr', columnGap: 10, alignItems: 'start', paddingLeft: 5 }}>
        <CalcoAviso size={20} />
        <div>
          <h2 style={{ margin: 0, fontFamily: M.titulos, fontSize: 13.5, lineHeight: '15px', fontWeight: 700, color: M.tinta }}>Avisos de cuidado</h2>
          <p style={{ color: '#3D4340', margin: '2px 0 0', fontSize: 10, lineHeight: '12px' }}>
            {petName || 'Tu mascota'} te avisará en el móvil. Con su propio estilo.
          </p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: kinds.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 7, marginTop: 9 }}>
        {kinds.map(kind => (
          <button
            key={kind}
            type="button"
            onClick={() => setEditing(kind)}
            className="text-left"
            style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto', alignItems: 'center', columnGap: 4, minHeight: 44, borderRadius: 10, border: '1px solid #F0EAE1', background: '#F9F5EF', padding: '4px 8px 4px 9px', minWidth: 0, cursor: 'pointer', font: 'inherit', fontFamily: M.letra }}
          >
            <span aria-hidden style={{ display: 'inline-flex', justifyContent: 'center' }}>
              {kind === 'feed' ? <CalcoCuenco size={16} /> : kind === 'walk' ? <CalcoPerroDorado size={20} /> : <Sparkles size={16} color={PET_COLORS.gold} />}
            </span>
            <span style={{ minWidth: 0, paddingLeft: 4 }}>
              <span style={{ display: 'block', color: M.tinta, fontWeight: 700, fontSize: 10.5, lineHeight: '12px' }}>{LABEL[kind].title}</span>
              <span style={{ display: 'block', color: '#4A504C', fontSize: 8.5, lineHeight: '10.5px', marginTop: 2 }}>{summary(kind, saved)}</span>
            </span>
            <span style={{ color: M.verdeBoton, fontSize: 9, fontWeight: 700 }}>Cambiar</span>
          </button>
        ))}
      </div>

      {editing && (
        <ReminderSheet
          kind={editing}
          petName={petName}
          value={saved}
          busy={save.isPending}
          onCancel={() => setEditing(null)}
          onSave={next => save.mutate(next)}
        />
      )}
    </div>
  );
}

function ReminderSheet({
  kind, petName, value, busy, onCancel, onSave,
}: {
  kind: Kind;
  petName?: string;
  value: CareReminders;
  busy: boolean;
  onCancel: () => void;
  onSave: (next: CareReminders) => void;
}) {
  const [mode, setMode] = React.useState<Mode>(() => modeOf(kind, value));
  const [times, setTimes] = React.useState<string[]>(() => {
    if (kind === 'litter') return [];
    const current = (value[kind] as { times: string[] }).times;
    return current.length ? current : kind === 'feed' ? ['08:00', '20:00'] : ['09:00', '19:30'];
  });
  const [everyDays, setEveryDays] = React.useState<number>(value.litter.everyDays || 2);
  const [litterTime, setLitterTime] = React.useState<string>(value.litter.time || '19:00');

  const confirm = () => {
    const next: CareReminders = JSON.parse(JSON.stringify(value));
    if (kind === 'litter') {
      next.litter = {
        off: mode === 'off',
        everyDays: mode === 'times' ? everyDays : null,
        time: mode === 'times' ? litterTime : null,
      };
    } else {
      const clean = Array.from(new Set(times.filter(Boolean))).sort();
      if (mode === 'times' && !clean.length) {
        toast.error('Añade al menos una hora');
        return;
      }
      next[kind] = { off: mode === 'off', times: mode === 'times' ? clean : [] };
    }
    onSave(next);
  };

  const option = (m: Mode, title: string, detail: string) => {
    const active = mode === m;
    return (
      <button
        type="button"
        onClick={() => setMode(m)}
        aria-pressed={active}
        className="border text-left"
        style={{
          borderRadius: 12, padding: '10px 12px',
          borderColor: active ? TEAL : '#E7E1D5',
          background: active ? '#EEF7F6' : '#FFFFFF',
          boxShadow: active ? `inset 0 0 0 1px ${TEAL}` : 'none',
        }}
      >
        <span className="font-semibold" style={{ display: 'block', color: INK }}>{title}</span>
        <span className="text-sm" style={{ display: 'block', color: MUTED }}>{detail}</span>
      </button>
    );
  };

  const timeInput = (v: string, onChange: (v: string) => void, label: string) => (
    <input
      type="time"
      aria-label={label}
      value={v}
      onChange={e => onChange(e.target.value)}
      className="border rounded px-3 py-2"
      style={{ fontSize: 16, minWidth: 0, flex: 1 }}
    />
  );

  return createPortal(
    <div style={backdrop} onClick={() => !busy && onCancel()}>
      <div role="dialog" aria-modal="true" aria-label={`Avisos de ${LABEL[kind].title.toLowerCase()}`} style={modal} onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold" style={{ color: INK }}>
          {LABEL[kind].icon} {LABEL[kind].title}{petName ? ` de ${petName}` : ''}
        </h3>

        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {option('times', kind === 'litter' ? 'Cada cierto tiempo' : 'A sus horas', kind === 'litter' ? 'Elige cada cuántos días y a qué hora' : 'Te avisamos a la hora, si no lo has apuntado ya')}
          {option('auto', 'Solo si se me olvida', LABEL[kind].auto)}
          {option('off', 'Sin avisos', 'No te mandamos nada de esto')}
        </div>

        {mode === 'times' && kind !== 'litter' && (
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            {times.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {timeInput(t, v => setTimes(prev => prev.map((x, j) => (j === i ? v : x))), `Hora ${i + 1}`)}
                {times.length > 1 && (
                  <button
                    type="button"
                    aria-label="Quitar esta hora"
                    onClick={() => setTimes(prev => prev.filter((_, j) => j !== i))}
                    style={{ padding: 0, width: 40, height: 40, borderRadius: 10, border: '1px solid #E7E1D5', background: '#fff', color: MUTED }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {times.length < 4 && (
              <button
                type="button"
                onClick={() => setTimes(prev => [...prev, '13:00'])}
                className="text-sm font-semibold"
                style={{ justifySelf: 'start', padding: '4px 0', background: 'none', border: 0, color: TEAL }}
              >
                + Añadir otra hora
              </button>
            )}
          </div>
        )}

        {mode === 'times' && kind === 'litter' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, color: INK }}>
            <span className="text-sm">Cada</span>
            <select
              value={everyDays}
              onChange={e => setEveryDays(Number(e.target.value))}
              className="border rounded px-2 py-2"
              style={{ fontSize: 16 }}
            >
              {[1, 2, 3, 4, 5, 7, 10, 14].map(n => <option key={n} value={n}>{n === 1 ? '1 día' : `${n} días`}</option>)}
            </select>
            <span className="text-sm">a las</span>
            {timeInput(litterTime, setLitterTime, 'Hora del aviso')}
          </div>
        )}

        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-2 rounded-xl text-sm font-semibold border"
            style={{ borderColor: '#D7D0C2', color: INK, background: '#FFFFFF' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="px-3 py-2 rounded-xl text-sm font-semibold"
            style={{ background: TEAL, color: '#FFFFFF', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 2000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};

const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 20, width: 'min(460px, 96vw)',
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 45px rgba(15,23,42,0.25)',
};
