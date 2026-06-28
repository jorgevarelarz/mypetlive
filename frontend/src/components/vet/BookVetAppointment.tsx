import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { CalendarPlus, MapPin, ShieldAlert, Clock } from 'lucide-react';
import {
  listVets,
  listMyVetAppointments,
  createVetAppointment,
  updateVetAppointmentStatus,
} from '../../api/vetAppointments';
import { getMyPatitas } from '../../api/patitas';
import { useAuth } from '../../context/AuthContext';
import { MPL, MPL_FONT_DISPLAY, MPL_FONT_MONO } from '../../styles/mypetlive';
import { STATUS_META, AppointmentCard } from './appointmentShared';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };
const inputStyle: React.CSSProperties = { border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 13px', font: 'inherit', width: '100%', boxSizing: 'border-box', background: '#fff' };

export default function BookVetAppointment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isShelter = user?.role === 'landlord';
  const [vetId, setVetId] = useState('');
  const [animalCode, setAnimalCode] = useState('');
  const [reason, setReason] = useState('');
  const [requestedAt, setRequestedAt] = useState('');
  const [patitasCost, setPatitasCost] = useState('');

  const vetsQ = useQuery({ queryKey: ['vets-directory'], queryFn: () => listVets(), staleTime: 60_000 });
  const apptsQ = useQuery({ queryKey: ['my-vet-appointments'], queryFn: () => listMyVetAppointments() });
  const patitasQ = useQuery({ queryKey: ['my-patitas'], queryFn: getMyPatitas, enabled: isShelter });
  const balance = patitasQ.data?.balance ?? 0;
  const vets = vetsQ.data?.items || [];
  const selectedVet = vets.find(v => v._id === vetId);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!vetId) throw new Error('vet_required');
      if (!reason.trim()) throw new Error('reason_required');
      if (!requestedAt) throw new Error('date_required');
      const cost = isShelter && patitasCost ? Math.max(0, Math.round(Number(patitasCost))) : undefined;
      if (cost && cost > balance) throw new Error('insufficient');
      return createVetAppointment({ vetId, reason: reason.trim(), requestedAt: new Date(requestedAt).toISOString(), animalCode: animalCode.trim() || undefined, patitasCost: cost });
    },
    onSuccess: () => {
      toast.success('Solicitud de cita enviada');
      setReason(''); setRequestedAt(''); setAnimalCode(''); setPatitasCost('');
      queryClient.invalidateQueries({ queryKey: ['my-vet-appointments'] });
    },
    onError: (e: any) => {
      const code = e?.response?.data?.error || e?.message;
      const map: Record<string, string> = {
        vet_required: 'Elige un veterinario', reason_required: 'Indica el motivo', date_required: 'Elige fecha y hora',
        date_in_past: 'La fecha no puede ser pasada', animal_not_found: 'No existe ese código de mascota',
        insufficient: 'No tienes suficientes Patitas', insufficient_patitas: 'No tienes suficientes Patitas',
      };
      toast.error(map[code] || 'No se pudo crear la solicitud');
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => updateVetAppointmentStatus(id, { status: 'cancelled' }),
    onSuccess: () => { toast.success('Cita cancelada'); queryClient.invalidateQueries({ queryKey: ['my-vet-appointments'] }); },
    onError: () => toast.error('No se pudo cancelar'),
  });

  const appts = apptsQ.data?.items || [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: MPL.teal100, color: MPL.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarPlus size={20} />
          </span>
          <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, margin: 0 }}>Pedir cita veterinaria</h3>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
            Veterinario
            <select value={vetId} onChange={e => setVetId(e.target.value)} style={inputStyle}>
              <option value="">{vetsQ.isLoading ? 'Cargando…' : 'Elige un veterinario'}</option>
              {vets.map(v => (
                <option key={v._id} value={v._id}>{v.name}{v.city ? ` · ${v.city}` : ''}{v.emergency24h ? ' · Urgencias 24h' : ''}</option>
              ))}
            </select>
          </label>

          {selectedVet && (
            <div style={{ background: MPL.bg, borderRadius: 12, padding: 12, fontSize: 13, color: MPL.muted, display: 'grid', gap: 6 }}>
              {selectedVet.city && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={14} /> {selectedVet.city}</div>}
              {selectedVet.schedule && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} /> {selectedVet.schedule}</div>}
              {selectedVet.emergency24h && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: MPL.coralDark, fontWeight: 700 }}><ShieldAlert size={14} /> Urgencias 24 h</div>}
              {selectedVet.services.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{selectedVet.services.map(s => <span key={s} style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 999, padding: '2px 9px', fontSize: 12 }}>{s}</span>)}</div>}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
              Mascota (código, opcional)
              <input value={animalCode} onChange={e => setAnimalCode(e.target.value.toUpperCase())} style={{ ...inputStyle, fontFamily: MPL_FONT_MONO }} placeholder="Ej. MILO-407" />
            </label>
            <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
              Fecha y hora
              <input type="datetime-local" value={requestedAt} onChange={e => setRequestedAt(e.target.value)} style={inputStyle} />
            </label>
          </div>
          <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
            Motivo
            <textarea value={reason} onChange={e => setReason(e.target.value)} style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} placeholder="Ej. Revisión general, vacuna anual…" />
          </label>
          {isShelter && (
            <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
              Pagar con Patitas (opcional)
              <input type="number" min={0} max={balance} value={patitasCost} onChange={e => setPatitasCost(e.target.value)} style={inputStyle} placeholder="0" />
              <span style={{ color: MPL.faint, fontSize: 12, fontWeight: 600 }}>
                Saldo: {balance} Patitas{patitasCost ? ` · gastarás ${Math.max(0, Math.round(Number(patitasCost)))} (≈ ${(Math.max(0, Math.round(Number(patitasCost))) * 0.1).toFixed(2)} €)` : ''}. Se descuentan al completar la cita.
              </span>
            </label>
          )}
          <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending}
            style={{ justifySelf: 'start', background: MPL.coral, color: '#fff', border: 0, borderRadius: 13, padding: '12px 20px', font: 'inherit', fontWeight: 800, cursor: 'pointer', opacity: createMut.isPending ? .7 : 1 }}>
            {createMut.isPending ? 'Enviando…' : 'Solicitar cita'}
          </button>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 12px' }}>Mis citas</h3>
        {apptsQ.isLoading ? (
          <div style={{ color: MPL.faint }}>Cargando…</div>
        ) : appts.length === 0 ? (
          <div style={{ color: MPL.faint, fontSize: 14 }}>Aún no tienes citas. Pide una arriba 👆</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {appts.map(a => (
              <AppointmentCard
                key={a._id}
                title={a.vetId?.profile?.orgName || a.vetId?.name || 'Veterinario'}
                appt={a}
                meta={STATUS_META}
                actions={['requested', 'confirmed', 'rescheduled'].includes(a.status)
                  ? [{ label: 'Cancelar', tone: 'danger', onClick: () => cancelMut.mutate(a._id) }]
                  : []}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
