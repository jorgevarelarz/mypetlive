import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { donatePatitas, getMyPatitas, getMyPatitasImpact, listProtectoras } from '../../api/patitas';
import PatitasHistory from '../../components/patitas/PatitasHistory';
import SelectProtectoraModal from '../../components/protectora/SelectProtectoraModal';
import CountUp from '../../components/CountUp';
import { M } from '../../components/pet/maqueta';
import { CalcoPanelPatitasNaranja, CalcoPatAutomatica, CalcoPatCorazon, CalcoPatEscudo, CalcoPatHistorial, CalcoPatHuella, CalcoPatRegalo } from '../../components/icons/calcados';

/**
 * Pantalla de Patitas (se llega desde el contador de la cabecera): el saldo con
 * un contador que sube cada vez que entras, a qué protectora van, donación
 * automática o a mano, qué se ha hecho con ellas y el historial.
 */

const TARJETA: React.CSSProperties = { background: '#FEFEFE', borderRadius: 22, border: '1px solid #EEE9E1', boxShadow: '0 1px 2px rgba(60,45,30,.04), 0 8px 20px -16px rgba(60,45,30,.3)', padding: '16px 16px 18px' };
const TITULO: React.CSSProperties = { margin: 0, fontFamily: M.titulos, fontSize: 20, lineHeight: '25px', fontWeight: 800, color: '#1E2A27' };
const CUADRO: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, flexShrink: 0 };

function Cabecera({ icono, fondo, titulo, subtitulo }: { icono: React.ReactNode; fondo: string; titulo: string; subtitulo: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ ...CUADRO, width: 54, height: 54, background: fondo }}>{icono}</span>
      <span style={{ minWidth: 0 }}>
        <h2 style={TITULO}>{titulo}</h2>
        <span style={{ display: 'block', marginTop: 2, fontSize: 14.5, lineHeight: '19px', color: '#5E6460' }}>{subtitulo}</span>
      </span>
    </div>
  );
}

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

  const [verEjemplos, setVerEjemplos] = React.useState(false);
  const historial = me?.history || [];

  // Maqueta del 2 nov 2026, a tamaño normal de iPhone (títulos 19-20, textos 14-15).
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 560, margin: '0 auto', color: '#1E2A27', fontFamily: M.letra }}>
      {/* El saldo: sube desde 0 cada vez que se entra. `key` lo reinicia si cambia. */}
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, background: '#14726E', color: '#fff', padding: '20px 20px 18px', minHeight: 132 }}>
        <img src="/ilustraciones/patitas-cabecera.png" alt="" aria-hidden style={{ position: 'absolute', right: 0, bottom: 0, height: '100%', maxHeight: 150, width: 'auto' }} />
        <div style={{ position: 'relative', maxWidth: '62%' }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Tus Patitas</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 6px' }}>
            <CalcoPanelPatitasNaranja size={30} />
            <span style={{ fontFamily: M.titulos, fontSize: 52, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {me ? <CountUp key={available} to={available} durationMs={1400} /> : '…'}
            </span>
          </div>
          <div style={{ fontSize: 14.5, lineHeight: '20px', opacity: 0.95 }}>
            = {eur(available * (me?.patitaValueEur ?? 0.1))} para protectoras · {me?.totalGenerated ?? 0} generadas en total
          </div>
        </div>
      </section>

      {/* A dónde van. */}
      <section style={TARJETA}>
        <Cabecera icono={<CalcoPatEscudo size={26} />} fondo="#E3F2E6" titulo="A qué protectora van" subtitulo="Elige la protectora que recibirá tus donaciones." />
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', height: 52, marginTop: 14, padding: '0 16px', border: '1px solid #E2DED5', borderRadius: 14, background: '#fff', font: 'inherit', cursor: 'pointer', textAlign: 'left', color: '#1E2A27' }}
        >
          <span style={{ fontSize: 16.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{target?.name || 'Elige una protectora'}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E2A27" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <div style={{ height: 1, background: '#ECE8E0', margin: '16px 0 14px' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: auto.shelterId ? 'pointer' : 'default', opacity: auto.shelterId ? 1 : 0.55 }}>
          <span style={{ ...CUADRO, width: 44, height: 44, background: '#E3F2E6' }}><CalcoPatAutomatica size={22} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 800 }}>Donación automática</span>
            <span style={{ display: 'block', fontSize: 14, lineHeight: '19px', color: '#5E6460' }}>Cada Patita que ganes va directa a {target?.name || 'tu protectora'}.</span>
          </span>
          <Switch
            checked={!!auto.enabled}
            disabled={!auto.shelterId || autoMut.isPending}
            onChange={v => autoMut.mutate({ enabled: v, shelterId: auto.shelterId })}
          />
        </label>
      </section>

      {/* A mano. */}
      <section style={TARJETA}>
        <Cabecera icono={<CalcoPatRegalo size={26} />} fondo="#FBE7DC" titulo="Donar a mano" subtitulo="Elige cuántas Patitas donar ahora." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 7, marginTop: 14 }}>
          {[10, 25, 50, 100].map(n => {
            const activo = amount === String(n);
            return (
              <button key={n} type="button" onClick={() => setAmount(activo ? '' : String(n))} aria-pressed={activo} disabled={available < n}
                style={{
                  height: 44, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: 0, cursor: available < n ? 'default' : 'pointer',
                  border: activo ? '1.5px solid #0E5F5B' : '1px solid #E2DED5', background: activo ? '#E4F2DE' : '#fff',
                  color: '#1E2A27', font: 'inherit', fontSize: 15.5, fontWeight: 800, opacity: available < n ? 0.45 : 1,
                }}>
                <CalcoPatHuella size={14} />{n}
              </button>
            );
          })}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={available}
            placeholder="Otras"
            aria-label="Otra cantidad"
            value={[10, 25, 50, 100].map(String).includes(amount) ? '' : amount}
            onChange={e => setAmount(e.target.value)}
            style={{ minWidth: 0, height: 44, boxSizing: 'border-box', border: '1px solid #E2DED5', borderRadius: 12, padding: '0 10px', font: 'inherit', fontSize: 15.5, background: '#fff', textAlign: 'center' }}
          />
        </div>
        <button
          type="button"
          onClick={() => donate(Number(amount))}
          disabled={donateMut.isPending || !available || !(Number(amount) > 0)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%', height: 54, marginTop: 14, border: 0, borderRadius: 14, background: '#C0491B', color: '#fff', font: 'inherit', fontSize: 17, fontWeight: 800, cursor: 'pointer', opacity: !available || !(Number(amount) > 0) ? 0.55 : 1 }}
        >
          <CalcoPatCorazon size={22} color="#FFFFFF" />
          {donateMut.isPending ? 'Donando…' : `Donar${amount ? ` ${amount}` : ''} a ${target?.name || 'una protectora'}`}
        </button>
        <p style={{ margin: '12px 0 0', fontSize: 13.5, color: '#5E6460', textAlign: 'center' }}>Ganas Patitas al usar cupones y comprar en tiendas asociadas.</p>
      </section>

      {/* Qué se ha hecho con ellas. */}
      <section style={{ ...TARJETA, background: 'linear-gradient(135deg, #F4F9F2 0%, #EAF4EC 100%)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '96px 1px minmax(0, 1fr)', gap: 14, alignItems: 'center' }}>
          <img src="/ilustraciones/patitas-casa.png" alt="" aria-hidden style={{ width: 96, height: 'auto' }} />
          <span aria-hidden style={{ alignSelf: 'stretch', background: '#D9E3D6' }} />
          <div>
            <h2 style={{ ...TITULO, fontSize: 18.5 }}>Qué se ha hecho con tus Patitas</h2>
            <p style={{ margin: '4px 0 6px', fontSize: 14.5, lineHeight: '20px', color: '#4A524D' }}>
              {impact?.shelters?.length
                ? 'A qué protectoras han ido tus Patitas y en qué las han usado.'
                : 'Cuando dones Patitas verás aquí a qué protectora fueron y en qué las ha usado (veterinario, tienda…).'}
            </p>
            {!impact?.shelters?.length && (
              <button type="button" onClick={() => setVerEjemplos(v => !v)} style={{ border: 0, background: 'none', padding: 0, color: '#0E5F5B', font: 'inherit', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                {verEjemplos ? 'Ocultar ejemplos' : 'Ver ejemplos ›'}
              </button>
            )}
          </div>
        </div>
        {verEjemplos && !impact?.shelters?.length && (
          <ul style={{ margin: '12px 0 0', paddingLeft: 20, display: 'grid', gap: 6, fontSize: 14.5, lineHeight: '20px', color: '#3D4340' }}>
            <li>Con 100 Patitas (10 €), una protectora paga parte de una vacuna en una clínica asociada.</li>
            <li>Con 250 Patitas (25 €), compra un saco de pienso en una tienda asociada.</li>
            <li>Cada canje sale aquí con la protectora, el sitio y lo que se pagó.</li>
          </ul>
        )}
        {impact?.earned?.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {impact.earned.map(e => (
              <span key={e.source} style={{ padding: '6px 10px', borderRadius: 10, background: '#FDF0D5', color: '#7A5A12', fontSize: 13.5, fontWeight: 800 }}>
                {SOURCE_LABEL[e.source] || e.source}: {e.amount}
              </span>
            ))}
          </div>
        ) : null}
        {impact?.shelters?.map(s => (
          <div key={s.id} style={{ borderTop: '1px solid #D9E3D6', marginTop: 12, paddingTop: 12, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <strong style={{ fontSize: 15.5 }}>{s.name}</strong>
              <span style={{ fontWeight: 800, color: '#0E5F5B', whiteSpace: 'nowrap' }}>{s.donated} · {eur(s.donatedEur)}</span>
            </div>
            {s.auto > 0 && <div style={{ fontSize: 14, color: '#5E6460' }}>{s.auto} de ellas con la donación automática.</div>}
            {s.uses.length ? (
              <div style={{ fontSize: 14, color: '#5E6460' }}>
                Con las Patitas que recibe, {s.name} ha pagado:{' '}
                {s.uses.map(u => `${u.concept.replace(/^Canje en /, '').toLowerCase()} (${eur(u.valueEur)})`).join(', ')}.
              </div>
            ) : (
              <div style={{ fontSize: 14, color: '#5E6460' }}>Todavía no las ha canjeado: las guarda para veterinario o tienda.</div>
            )}
          </div>
        ))}
      </section>

      <section style={TARJETA}>
        <Cabecera icono={<CalcoPatHistorial size={26} />} fondo="#D7ECE9" titulo="Historial" subtitulo="Tus donaciones y movimientos de Patitas." />
        {historial.length ? (
          <div style={{ marginTop: 12 }}>
            <PatitasHistory items={historial} meId={meId} emptyText="Aún no tienes movimientos." />
          </div>
        ) : (
          <div style={{ display: 'grid', justifyItems: 'center', gap: 10, padding: '14px 0 6px' }}>
            <img src="/ilustraciones/patitas-vacio.png" alt="" aria-hidden style={{ width: 128, height: 'auto' }} />
            <span style={{ fontSize: 16, fontWeight: 800, color: '#3D4340' }}>Aún no tienes movimientos.</span>
          </div>
        )}
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
      style={{ width: 56, height: 32, padding: 0, borderRadius: 999, border: 0, flexShrink: 0, background: checked ? '#136D69' : '#D7D0C2', position: 'relative', cursor: disabled ? 'default' : 'pointer', transition: 'background .2s' }}
    >
      <span style={{ position: 'absolute', top: 3, left: checked ? 27 : 3, width: 26, height: 26, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .2s' }} />
    </button>
  );
}
