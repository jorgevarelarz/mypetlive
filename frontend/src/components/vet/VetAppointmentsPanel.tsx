import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { CalendarDays } from 'lucide-react';
import { listMyVetAppointments, updateVetAppointmentStatus, type VetAppointment, type VetAppointmentStatus } from '../../api/vetAppointments';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { STATUS_META, AppointmentCard } from './appointmentShared';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };
const inputStyle: React.CSSProperties = { border: `1.5px solid ${MPL.border}`, borderRadius: 10, padding: '8px 10px', font: 'inherit', background: '#fff' };

const ACTIVE: VetAppointmentStatus[] = ['requested', 'confirmed', 'rescheduled'];

export default function VetAppointmentsPanel() {
  const queryClient = useQueryClient();
  const [reschedFor, setReschedFor] = useState<string | null>(null);
  const [reschedAt, setReschedAt] = useState('');

  const apptsQ = useQuery({ queryKey: ['vet-appointments'], queryFn: () => listMyVetAppointments() });

  const mut = useMutation({
    mutationFn: (vars: { id: string; status: VetAppointmentStatus; scheduledAt?: string }) =>
      updateVetAppointmentStatus(vars.id, { status: vars.status, scheduledAt: vars.scheduledAt }),
    onSuccess: () => {
      toast.success('Cita actualizada');
      setReschedFor(null); setReschedAt('');
      queryClient.invalidateQueries({ queryKey: ['vet-appointments'] });
    },
    onError: (e: any) => {
      const code = e?.response?.data?.error;
      toast.error(code === 'scheduled_at_required' ? 'Indica la nueva fecha' : 'No se pudo actualizar');
    },
  });

  const all = apptsQ.data?.items || [];
  const active = all.filter(a => ACTIVE.includes(a.status));
  const past = all.filter(a => !ACTIVE.includes(a.status));

  const renderActions = (a: VetAppointment) => {
    if (!ACTIVE.includes(a.status)) return [];
    const acts: any[] = [];
    if (a.status === 'requested') acts.push({ label: 'Confirmar', tone: 'primary', onClick: () => mut.mutate({ id: a._id, status: 'confirmed' }) });
    if (a.status === 'confirmed' || a.status === 'rescheduled') acts.push({ label: 'Marcar completada', tone: 'primary', onClick: () => mut.mutate({ id: a._id, status: 'completed' }) });
    acts.push({ label: reschedFor === a._id ? 'Cerrar' : 'Reprogramar', tone: 'neutral', onClick: () => { setReschedFor(reschedFor === a._id ? null : a._id); setReschedAt(''); } });
    acts.push({ label: 'Cancelar', tone: 'danger', onClick: () => mut.mutate({ id: a._id, status: 'cancelled' }) });
    return acts;
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, background: MPL.teal100, color: MPL.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CalendarDays size={20} />
        </span>
        <div>
          <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, margin: 0 }}>Agenda de citas</h3>
          <p style={{ color: MPL.faint, fontSize: 13, margin: 0 }}>Solicitudes y citas de tus pacientes.</p>
        </div>
      </div>

      {apptsQ.isLoading ? (
        <div style={{ color: MPL.faint }}>Cargando…</div>
      ) : all.length === 0 ? (
        <div style={{ color: MPL.faint, fontSize: 14 }}>Todavía no tienes solicitudes de cita.</div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {active.length > 0 && (
            <div style={{ display: 'grid', gap: 10 }}>
              {active.map(a => (
                <AppointmentCard key={a._id} title={a.userId?.name || 'Cliente'} appt={a} meta={STATUS_META} actions={renderActions(a)}>
                  {reschedFor === a._id && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: MPL.bg, borderRadius: 10, padding: 10 }}>
                      <input type="datetime-local" value={reschedAt} onChange={e => setReschedAt(e.target.value)} style={inputStyle} />
                      <button type="button" disabled={!reschedAt || mut.isPending}
                        onClick={() => mut.mutate({ id: a._id, status: 'rescheduled', scheduledAt: new Date(reschedAt).toISOString() })}
                        style={{ background: MPL.teal, color: '#fff', border: 0, borderRadius: 10, padding: '8px 14px', font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: reschedAt ? 1 : .6 }}>
                        Proponer nueva fecha
                      </button>
                    </div>
                  )}
                </AppointmentCard>
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: MPL.muted, marginBottom: 8 }}>Historial</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {past.map(a => (
                  <AppointmentCard key={a._id} title={a.userId?.name || 'Cliente'} appt={a} meta={STATUS_META} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
