import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { getMyPatitas, listProtectoras, donatePatitas } from '../../api/patitas';
import PatitasHistory from './PatitasHistory';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };
const input: React.CSSProperties = { border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 13px', font: 'inherit', width: '100%', boxSizing: 'border-box', background: '#fff' };

export default function PatitasUserPanel() {
  const { user, updateUser } = useAuth();
  const meId = String(user?._id || '');
  const qc = useQueryClient();
  const [donateAmount, setDonateAmount] = useState('');
  const [donateShelter, setDonateShelter] = useState('');

  const meQ = useQuery({ queryKey: ['patitas-me'], queryFn: getMyPatitas });
  const sheltersQ = useQuery({ queryKey: ['protectoras'], queryFn: listProtectoras });

  const auto = meQ.data?.autoDonate || { enabled: false };
  const shelters = sheltersQ.data?.items || [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['patitas-me'] });

  const autoMut = useMutation({
    mutationFn: async (next: { enabled: boolean; shelterId?: string }) => {
      const { data } = await api.patch(`/api/users/${meId}`, { profile: { autoDonate: next } });
      return data;
    },
    onSuccess: updated => { updateUser(updated); refresh(); toast.success('Auto-donación actualizada'); },
    onError: () => toast.error('No se pudo actualizar'),
  });

  const donateMut = useMutation({
    mutationFn: () => donatePatitas({ shelterId: donateShelter, amount: Number(donateAmount) }),
    onSuccess: res => { toast.success(`Donaste ${donateAmount} 🐾 a ${res.shelterName || 'la protectora'}`); setDonateAmount(''); refresh(); },
    onError: (e: any) => toast.error(e?.response?.data?.error === 'insufficient_patitas' ? 'No tienes suficientes Patitas' : 'No se pudo donar'),
  });

  const balance = meQ.data?.balance ?? 0;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
        <div style={{ ...card, background: MPL.teal, color: '#fff', border: 'none' }}>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.8)', fontWeight: 800 }}>Mis Patitas</div>
          <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 38, fontWeight: 800, lineHeight: 1.1 }}>{balance} 🐾</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.82)' }}>≈ {(meQ.data?.valueEur ?? 0).toFixed(2)} € de impacto</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12.5, color: MPL.faint, fontWeight: 800 }}>Total generadas</div>
          <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 38, fontWeight: 800, lineHeight: 1.1, color: MPL.ink }}>{meQ.data?.totalGenerated ?? 0}</div>
          <div style={{ fontSize: 13, color: MPL.muted }}>desde que te uniste</div>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 4px' }}>Donación automática</h3>
        <p style={{ color: MPL.muted, fontSize: 13.5, margin: '0 0 14px' }}>Reenvía automáticamente cada Patita que generes a tu protectora favorita.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={!!auto.enabled}
              onChange={e => autoMut.mutate({ enabled: e.target.checked, shelterId: auto.shelterId })}
            />
            Activar
          </label>
          <select
            value={auto.shelterId || ''}
            onChange={e => autoMut.mutate({ enabled: auto.enabled, shelterId: e.target.value || undefined })}
            style={{ ...input, width: 'auto', minWidth: 220 }}
          >
            <option value="">Elige protectora…</option>
            {shelters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 14px' }}>Donar Patitas ahora</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
            Protectora
            <select value={donateShelter} onChange={e => setDonateShelter(e.target.value)} style={{ ...input, minWidth: 220 }}>
              <option value="">Elige…</option>
              {shelters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
            Patitas
            <input type="number" min={1} max={balance} value={donateAmount} onChange={e => setDonateAmount(e.target.value)} style={{ ...input, width: 120 }} />
          </label>
          <button
            type="button"
            onClick={() => donateMut.mutate()}
            disabled={donateMut.isPending || !donateShelter || !Number(donateAmount)}
            style={{ background: MPL.coral, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}
          >
            {donateMut.isPending ? 'Donando…' : 'Donar 🐾'}
          </button>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 14px' }}>Histórico</h3>
        <PatitasHistory items={meQ.data?.history || []} meId={meId} emptyText="Aún no has generado Patitas. ¡Usa un cupón o visita una tienda asociada!" />
      </div>
    </div>
  );
}
