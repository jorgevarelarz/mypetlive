import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { VetAppointment } from '../../api/vetAppointments';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { STATUS_META, AppointmentCard } from './appointmentShared';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };

// Día de la cita: usa scheduledAt si está confirmada, si no la fecha solicitada.
function apptDate(a: VetAppointment) {
  return new Date(a.scheduledAt || a.requestedAt);
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function AppointmentsCalendar({
  appointments,
  title = 'Calendario',
  counterpartName,
  renderActions,
}: {
  appointments: VetAppointment[];
  title?: string;
  // Cómo titular cada cita (nombre de la contraparte): para el vet, el cliente; para el usuario, el vet.
  counterpartName: (a: VetAppointment) => string;
  renderActions?: (a: VetAppointment) => Array<{ label: string; tone?: 'primary' | 'danger' | 'neutral'; onClick: () => void }>;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));

  // Mapa día(ISO date)→citas, ignorando canceladas en los puntos (pero visibles al seleccionar).
  const byDay = useMemo(() => {
    const m = new Map<string, VetAppointment[]>();
    for (const a of appointments) {
      const d = apptDate(a);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    }
    return m;
  }, [appointments]);

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const selectedAppts = useMemo(() => {
    return appointments
      .filter(a => sameDay(apptDate(a), selected))
      .sort((x, y) => apptDate(x).getTime() - apptDate(y).getTime());
  }, [appointments, selected]);

  const move = (delta: number) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, margin: 0 }}>{title}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={() => move(-1)} aria-label="Mes anterior" style={navBtn}><ChevronLeft size={18} /></button>
          <span style={{ fontWeight: 800, minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span>
          <button type="button" onClick={() => move(1)} aria-label="Mes siguiente" style={navBtn}><ChevronRight size={18} /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 12, fontWeight: 800, color: MPL.faint, padding: '4px 0' }}>{w}</div>
        ))}
        {grid.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayAppts = (byDay.get(key) || []).filter(a => a.status !== 'cancelled');
          const isToday = sameDay(d, today);
          const isSel = sameDay(d, selected);
          return (
            <button key={i} type="button" onClick={() => setSelected(d)}
              style={{
                minHeight: 56, borderRadius: 10, padding: 5, textAlign: 'left', cursor: 'pointer',
                border: isSel ? `2px solid ${MPL.teal}` : `1px solid ${MPL.border}`,
                background: isToday ? MPL.teal100 : '#fff', font: 'inherit',
              }}>
              <div style={{ fontSize: 12.5, fontWeight: isToday ? 800 : 600, color: MPL.ink }}>{d.getDate()}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 3 }}>
                {dayAppts.slice(0, 3).map(a => (
                  <span key={a._id} title={STATUS_META[a.status].label}
                    style={{ width: 7, height: 7, borderRadius: 999, background: STATUS_META[a.status].color }} />
                ))}
                {dayAppts.length > 3 && <span style={{ fontSize: 9, color: MPL.faint }}>+{dayAppts.length - 3}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detalle del día seleccionado */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: MPL.muted, marginBottom: 8 }}>
          {selected.getDate()} de {MONTHS[selected.getMonth()]}
        </div>
        {selectedAppts.length === 0 ? (
          <div style={{ color: MPL.faint, fontSize: 14 }}>Sin citas este día.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {selectedAppts.map(a => (
              <AppointmentCard key={a._id} title={counterpartName(a)} appt={a} meta={STATUS_META} actions={renderActions ? renderActions(a) : []} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 9, border: `1px solid ${MPL.border}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: MPL.ink };
