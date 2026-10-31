import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { listMyVetAppointments, type VetAppointment } from '../../api/vetAppointments';
import AppointmentsCalendar from '../../components/vet/AppointmentsCalendar';
import ConnectCalendar from '../../components/vet/ConnectCalendar';
import VetAppointmentsPanel from '../../components/vet/VetAppointmentsPanel';
import BookVetAppointment from '../../components/vet/BookVetAppointment';
import AdoptionVisitsPanel from '../../components/vet/AdoptionVisitsPanel';
import { MPL_FONT_DISPLAY, MPL } from '../../styles/mypetlive';

export default function AppointmentsPage() {
  const { user } = useAuth();
  const isVet = user?.role === 'vet';

  // Mismas keys que los paneles → react-query comparte la caché.
  const queryKey = isVet ? ['vet-appointments'] : ['my-vet-appointments'];
  const apptsQ = useQuery({ queryKey, queryFn: () => listMyVetAppointments() });
  const appointments = apptsQ.data?.items || [];

  const vetTitle = (a: VetAppointment) => a.userId?.name || 'Cliente';
  const ownerTitle = (a: VetAppointment) => a.vetId?.profile?.orgName || a.vetId?.name || 'Veterinario';

  // Desde el chat se llega con ?cita=<id> o ?visita=<id>: se busca y se resalta.
  const [params] = useSearchParams();
  const target = params.get('cita') ? `[data-cita="${params.get('cita')}"]` : params.get('visita') ? `[data-visita="${params.get('visita')}"]` : null;
  useEffect(() => {
    if (!target) return;
    let tries = 0;
    const timer = setInterval(() => {
      // Puede pintarse dos veces (calendario y lista): la última es la de la lista.
      const all = document.querySelectorAll<HTMLElement>(target);
      const el = all[all.length - 1];
      if (el || ++tries > 20) {
        clearInterval(timer);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('mpl-highlight');
          setTimeout(() => el.classList.remove('mpl-highlight'), 2600);
        }
      }
    }, 250);
    return () => clearInterval(timer);
  }, [target]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18, padding: '24px 16px', maxWidth: 900, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 30, fontWeight: 800, margin: 0 }}>{isVet ? 'Agenda de citas' : 'Citas'}</h1>
          <p style={{ color: MPL.muted, margin: '6px 0 0' }}>
            {isVet
              ? 'Tu agenda: solicitudes y citas de tus pacientes.'
              : user?.role === 'landlord'
                ? 'Visitas para conocer a tus animales y citas con el veterinario.'
                : 'Visitas de adopción y citas con el veterinario. Pide una cita nueva abajo.'}
          </p>
        </div>
        {isVet && <ConnectCalendar />}
      </header>

      <style>{`
        .mpl-highlight { outline: 3px solid ${MPL.coral}; outline-offset: 3px; transition: outline-color .6s; }
      `}</style>

      {!isVet && (user?.role === 'tenant' || user?.role === 'landlord') && <AdoptionVisitsPanel role={user.role} />}

      <AppointmentsCalendar
        appointments={appointments}
        title={isVet ? 'Agenda mensual' : 'Mi calendario'}
        counterpartName={isVet ? vetTitle : ownerTitle}
        // El calendario no puede pintar un fallo de red como un mes sin citas:
        // para un vet eso es creer que hoy no tiene agenda.
        isLoading={apptsQ.isLoading}
        isError={apptsQ.isError}
        onRetry={() => apptsQ.refetch()}
      />

      {isVet ? <VetAppointmentsPanel /> : <BookVetAppointment />}
    </div>
  );
}
