import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { donatePatitas, getMyPatitas, getMyPatitasImpact, listProtectoras } from '../../api/patitas';
import PatitasHistory from '../../components/patitas/PatitasHistory';
import SelectProtectoraModal from '../../components/protectora/SelectProtectoraModal';
import CountUp from '../../components/CountUp';
import { MPL, MPL_FONT_DISPLAY, PawMark } from '../../styles/mypetlive';

/**
 * Pantalla de Patitas (se llega desde el contador de la cabecera): el saldo con
 * un contador que sube cada vez que entras, a qué protectora van, donación
 * automática o a mano, qué se ha hecho con ellas y el historial.
 */

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 18 };
const h2: React.CSSProperties = { fontFamily: MPL_FONT_DISPLAY, fontSize: 19, fontWeight: 800, margin: 0 };

const SOURCE_LABEL: Record<string, string> = {
  coupon: 'Cupones', visit: 'Visitas a tiendas', purchase: 'Compras', manual: 'Regalos', otros: 'Otros',
};

const eur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

export default function PatitasPage() {
  const { user, updateUser } = useAuth();
  const meId = String(user?._id || '');
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ['patitas-me'], queryFn: getMyPatitas });
  const impactQ = useQuery({ queryKey: ['patitas-impact'], queryFn: getMyPatitasImpact });
  const sheltersQ = useQuery({ queryKey: ['protectoras'], queryFn: listProtectoras });
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('');

  const me = meQ.data;
  const available = me?.available ?? 0;
  const auto = me?.autoDonate || { enabled: false };
  const shelters = sheltersQ.data?.items || [];
  const target = shelters.find(s => s.id === auto.shelterId);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['patitas-me'] });
    qc.invalidateQueries({ queryKey: ['patitas-impact'] });
  };

  // La protectora elegida y la donación automática viven en el perfil.
  const autoMut = useMutation({
    mutationFn: async (next: { enabled: boolean; shelterId?: string }) => {
      const { data } = await api.patch(`/api/users/${meId}`, { profile: { autoDonate: next } });
      return data;
    },
    onSuccess: updated => { updateUser(updated); refresh(); },
    onError: () => toast.error('No se pudo guardar'),
  });

  const donateMut = useMutation({
    mutationFn: (n: number) => donatePatitas({ shelterId: auto.shelterId!, amount: n }),
    onSuccess: (res, n) => {
      toast.success(`Has donado ${n} Patitas a ${res.shelterName || target?.name || 'la protectora'}`);
      setAmount('');
      refresh();
    },
    onError: (e: any) => {
      const code = e?.response?.data?.error;
      toast.error(code === 'insufficient_patitas' ? 'No tienes tantas Patitas' : code === 'shelter_verification_required' ? 'Esa protectora aún no puede recibir donaciones' : 'No se pudo donar');
    },
  });

  const donate = (n: number) => {
    if (!auto.shelterId) { setPickerOpen(true); return; }
    if (!Number.isFinite(n) || n <= 0) return;
    donateMut.mutate(Math.min(Math.round(n), available));
  };

  const impact = impactQ.data;

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 640, margin: '0 auto', color: MPL.ink }}>
      {/* El saldo: sube desde 0 cada vez que se entra. `key` lo reinicia si cambia. */}
      <section style={{ ...card, background: MPL.teal, border: 'none', color: '#fff', padding: '22px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.85 }}>Tus Patitas</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 2px' }}>
          <span style={{ color: MPL.gold }}><PawMark size={34} /></span>
          <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 52, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {me ? <CountUp key={available} to={available} durationMs={1400} /> : '…'}
          </span>
        </div>
        <div style={{ fontSize: 14, opacity: 0.9 }}>
          ≈ {eur(available * (me?.patitaValueEur ?? 0.1))} para protectoras · {me?.totalGenerated ?? 0} generadas en total
        </div>
        <span style={{ position: 'absolute', right: -18, bottom: -24, color: 'rgba(255,255,255,.08)' }} aria-hidden><PawMark size={150} /></span>
      </section>

      {/* A dónde van. */}
      <section style={{ ...card, display: 'grid', gap: 12 }}>
        <h2 style={h2}>A qué protectora van</h2>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', border: `1.5px solid ${MPL.border}`, borderRadius: 14, background: MPL.bg, font: 'inherit', cursor: 'pointer', textAlign: 'left', color: MPL.ink }}
        >
          <span style={{ fontWeight: 800 }}>{target?.name || 'Elige una protectora'}</span>
          <span style={{ fontSize: 13, color: MPL.teal, fontWeight: 800 }}>{target ? 'Cambiar' : 'Elegir'}</span>
        </button>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: auto.shelterId ? 'pointer' : 'default', opacity: auto.shelterId ? 1 : 0.55 }}>
          <span>
            <span style={{ display: 'block', fontWeight: 800 }}>Donación automática</span>
            <span style={{ display: 'block', fontSize: 13, color: MPL.muted }}>Cada Patita que ganes va directa a {target?.name || 'tu protectora'}.</span>
          </span>
          <Switch
            checked={!!auto.enabled}
            disabled={!auto.shelterId || autoMut.isPending}
            onChange={v => autoMut.mutate({ enabled: v, shelterId: auto.shelterId })}
          />
        </label>
      </section>

      {/* A mano. */}
      <section style={{ ...card, display: 'grid', gap: 12 }}>
        <h2 style={h2}>Donar a mano</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={available}
            placeholder="Cuántas"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{ flex: 1, minWidth: 0, border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 13px', font: 'inherit', background: '#fff' }}
          />
          <button type="button" onClick={() => setAmount(String(available))} disabled={!available} style={{ padding: '0 14px', border: `1.5px solid ${MPL.border}`, borderRadius: 12, background: '#fff', font: 'inherit', fontWeight: 800, color: MPL.ink, cursor: 'pointer' }}>
            Todas
          </button>
        </div>
        <button
          type="button"
          onClick={() => donate(Number(amount))}
          disabled={donateMut.isPending || !available || !(Number(amount) > 0)}
          style={{ padding: '13px 16px', border: 0, borderRadius: 14, background: MPL.coral, color: '#fff', font: 'inherit', fontWeight: 800, cursor: 'pointer', opacity: !available || !(Number(amount) > 0) ? 0.5 : 1 }}
        >
          {donateMut.isPending ? 'Donando…' : `Donar${amount ? ` ${amount}` : ''} a ${target?.name || 'una protectora'}`}
        </button>
        {!available && <p style={{ margin: 0, fontSize: 13, color: MPL.muted }}>Ganas Patitas al usar cupones y comprar en tiendas asociadas.</p>}
      </section>

      {/* Qué se ha hecho con ellas. */}
      <section style={{ ...card, display: 'grid', gap: 12 }}>
        <h2 style={h2}>Qué se ha hecho con tus Patitas</h2>
        {impact?.earned?.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {impact.earned.map(e => (
              <span key={e.source} style={{ padding: '6px 10px', borderRadius: 10, background: MPL.gold100, color: MPL.goldDark, fontSize: 13, fontWeight: 800 }}>
                {SOURCE_LABEL[e.source] || e.source}: {e.amount}
              </span>
            ))}
          </div>
        ) : null}
        {impact?.shelters?.length ? (
          impact.shelters.map(s => (
            <div key={s.id} style={{ borderTop: `1px solid ${MPL.border}`, paddingTop: 12, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <strong>{s.name}</strong>
                <span style={{ fontWeight: 800, color: MPL.teal, whiteSpace: 'nowrap' }}>{s.donated} · {eur(s.donatedEur)}</span>
              </div>
              {s.auto > 0 && <div style={{ fontSize: 13, color: MPL.muted }}>{s.auto} de ellas con la donación automática.</div>}
              {s.uses.length ? (
                <div style={{ fontSize: 13, color: MPL.muted }}>
                  Con las Patitas que recibe, {s.name} ha pagado:{' '}
                  {s.uses.map(u => `${u.concept.replace(/^Canje en /, '').toLowerCase()} (${eur(u.valueEur)})`).join(', ')}.
                </div>
              ) : (
                <div style={{ fontSize: 13, color: MPL.muted }}>Todavía no las ha canjeado: las guarda para veterinario o tienda.</div>
              )}
            </div>
          ))
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: MPL.muted }}>
            Cuando dones Patitas verás aquí a qué protectora fueron y en qué las ha usado (veterinario, tienda…).
          </p>
        )}
      </section>

      <section style={{ ...card, display: 'grid', gap: 8 }}>
        <h2 style={h2}>Historial</h2>
        <PatitasHistory items={me?.history || []} meId={meId} emptyText="Aún no tienes movimientos." />
      </section>

      <SelectProtectoraModal
        open={pickerOpen}
        selectedId={auto.shelterId}
        title="¿A qué protectora van tus Patitas?"
        onClose={() => setPickerOpen(false)}
        onConfirm={option => {
          setPickerOpen(false);
          autoMut.mutate({ enabled: !!auto.enabled, shelterId: option.id });
        }}
      />
    </div>
  );
}

function Switch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{ width: 50, height: 30, padding: 0, borderRadius: 999, border: 0, flexShrink: 0, background: checked ? MPL.teal : '#D7D0C2', position: 'relative', cursor: disabled ? 'default' : 'pointer', transition: 'background .2s' }}
    >
      <span style={{ position: 'absolute', top: 3, left: checked ? 23 : 3, width: 24, height: 24, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .2s' }} />
    </button>
  );
}
