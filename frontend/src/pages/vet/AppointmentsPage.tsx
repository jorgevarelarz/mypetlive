import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { listMyVetAppointments, updateVetAppointmentStatus, type VetAppointment } from '../../api/vetAppointments';
import AppointmentsCalendar from '../../components/vet/AppointmentsCalendar';
import ConnectCalendar from '../../components/vet/ConnectCalendar';
import VetAppointmentsPanel from '../../components/vet/VetAppointmentsPanel';
import BookVetAppointment from '../../components/vet/BookVetAppointment';
import { MPL_FONT_DISPLAY, MPL } from '../../styles/mypetlive';

export default function AppointmentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isVet = user?.role === 'vet';

  // Mismas keys que los paneles → react-query comparte la caché.
  const queryKey = isVet ? ['vet-appointments'] : ['my-vet-appointments'];
  const apptsQ = useQuery({ queryKey, queryFn: () => listMyVetAppointments() });
  const appointments = apptsQ.data?.items || [];

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      updateVetAppointmentStatus(id, { status: 'rescheduled', scheduledAt }),
    onSuccess: () => {
      toast.success('Cita reprogramada');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: any) => {
      const code = error?.response?.data?.error;
      toast.error(code === 'scheduled_at_required' || code === 'invalid_date'
        ? 'Indica una fecha y hora válidas'
        : 'No se pudo reprogramar la cita');
    },
  });

  const vetTitle = (a: VetAppointment) => a.userId?.name || 'Cliente';
  const ownerTitle = (a: VetAppointment) => a.vetId?.profile?.orgName || a.vetId?.name || 'Veterinario';

  return (
    <div style={{ display: 'grid', gap: 18, padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 30, fontWeight: 800, margin: 0 }}>Citas veterinarias 🩺</h1>
          <p style={{ color: MPL.muted, margin: '6px 0 0' }}>
            {isVet ? 'Tu agenda: solicitudes y citas de tus pacientes.' : 'Tus citas con el veterinario. Solicita una nueva abajo.'}
          </p>
        </div>
        {isVet && <ConnectCalendar />}
      </header>

      <AppointmentsCalendar
        appointments={appointments}
        title={isVet ? 'Agenda' : 'Mi calendario'}
        counterpartName={isVet ? vetTitle : ownerTitle}
        onReschedule={isVet
          ? async (appointment, scheduledAt) => {
              await rescheduleMutation.mutateAsync({ id: appointment._id, scheduledAt });
            }
          : undefined}
        rescheduling={rescheduleMutation.isPending}
      />

      {isVet ? <VetAppointmentsPanel /> : <BookVetAppointment />}
    </div>
  );
}
