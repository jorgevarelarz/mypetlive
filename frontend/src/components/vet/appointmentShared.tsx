import React from 'react';
import { CalendarDays, PawPrint } from 'lucide-react';
import { MPL, MPL_FONT_MONO } from '../../styles/mypetlive';
import type { VetAppointment, VetAppointmentStatus } from '../../api/vetAppointments';

export const STATUS_META: Record<VetAppointmentStatus, { label: string; bg: string; color: string }> = {
  requested: { label: 'Solicitada', bg: MPL.gold100, color: MPL.goldDark },
  confirmed: { label: 'Confirmada', bg: MPL.olive100, color: MPL.oliveDark },
  rescheduled: { label: 'Reprogramada', bg: MPL.teal100, color: MPL.tealDark },
  completed: { label: 'Completada', bg: '#E7E1D5', color: MPL.muted },
  cancelled: { label: 'Cancelada', bg: MPL.coral100, color: MPL.coralDark },
};

function fmt(d?: string) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type Action = { label: string; tone?: 'primary' | 'danger' | 'neutral'; onClick: () => void };

export function AppointmentCard({
  title,
  appt,
  meta,
  actions = [],
  children,
}: {
  title: string;
  appt: VetAppointment;
  meta: typeof STATUS_META;
  actions?: Action[];
  children?: React.ReactNode;
}) {
  const s = meta[appt.status];
  const shown = appt.scheduledAt || appt.requestedAt;
  return (
    <div style={{ border: `1px solid ${MPL.border}`, borderRadius: 14, padding: 14, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: MPL.muted, fontSize: 12.5, marginTop: 3 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalendarDays size={13} /> {fmt(shown)}{appt.scheduledAt && appt.scheduledAt !== appt.requestedAt ? ' (reprogramada)' : ''}</span>
            {appt.animalCode && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: MPL_FONT_MONO }}><PawPrint size={13} /> {appt.animalCode}</span>}
          </div>
        </div>
        <span style={{ flex: 'none', background: s.bg, color: s.color, borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 800 }}>{s.label}</span>
      </div>
      <div style={{ fontSize: 13.5, color: MPL.ink }}>{appt.reason}</div>
      {appt.service && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'start', background: MPL.teal100, color: MPL.tealDark, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 800 }}>
          {appt.service.name}
          {appt.service.priceEur != null
            ? ` · ${appt.service.priceEur.toLocaleString('es-ES')} €${appt.service.pricingType === 'fijo' ? '' : ' (orientativo)'}`
            : ' · presupuesto'}
        </div>
      )}
      {(appt.patitasCost ?? 0) > 0 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'start', background: MPL.gold100, color: MPL.goldDark, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 800 }}>
          🐾 {appt.patitasCost} Patitas {appt.patitasPaid ? '· pagadas' : appt.status === 'completed' ? '· pendiente' : '· al completar'}
        </div>
      )}
      {appt.vetNotes && <div style={{ fontSize: 12.5, color: MPL.muted, background: MPL.bg, borderRadius: 10, padding: '7px 10px' }}>Nota del vet: {appt.vetNotes}</div>}
      {appt.cancelReason && <div style={{ fontSize: 12.5, color: MPL.coralDark }}>Motivo de cancelación: {appt.cancelReason}</div>}
      {children}
      {actions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {actions.map(a => (
            <button key={a.label} type="button" onClick={a.onClick}
              style={{
                border: a.tone === 'danger' ? `1.5px solid ${MPL.coral}` : a.tone === 'primary' ? 0 : `1.5px solid ${MPL.border}`,
                background: a.tone === 'primary' ? MPL.teal : '#fff',
                color: a.tone === 'primary' ? '#fff' : a.tone === 'danger' ? MPL.coralDark : MPL.ink,
                borderRadius: 11, padding: '8px 14px', font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer',
              }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
