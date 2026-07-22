import React, { useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import type { VetAppointment, VetAppointmentStatus } from '../../api/vetAppointments';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { STATUS_META, AppointmentCard } from './appointmentShared';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEKDAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const RESCHEDULABLE: VetAppointmentStatus[] = ['requested', 'confirmed', 'rescheduled'];

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };
const inputStyle: React.CSSProperties = { border: `1.5px solid ${MPL.border}`, borderRadius: 10, padding: '9px 11px', font: 'inherit', background: '#fff' };

// Día de la cita: usa scheduledAt si está confirmada, si no la fecha solicitada.
function apptDate(a: VetAppointment) {
  return new Date(a.scheduledAt || a.requestedAt);
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function startOfWeek(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}
function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}
function inputDateTime(d: Date) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

type CalendarAction = { label: string; tone?: 'primary' | 'danger' | 'neutral'; onClick: () => void };

export default function AppointmentsCalendar({
  appointments,
  title = 'Calendario',
  counterpartName,
  renderActions,
  onReschedule,
  rescheduling = false,
}: {
  appointments: VetAppointment[];
  title?: string;
  // Cómo titular cada cita (nombre de la contraparte): para el vet, el cliente; para el usuario, el vet.
  counterpartName: (a: VetAppointment) => string;
  renderActions?: (a: VetAppointment) => CalendarAction[];
  // Solo se facilita al veterinario. Su ausencia convierte ambas vistas en solo lectura.
  onReschedule?: (appointment: VetAppointment, scheduledAt: string) => Promise<void>;
  rescheduling?: boolean;
}) {
  const today = new Date();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [monthCursor, setMonthCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [weekCursor, setWeekCursor] = useState(() => startOfWeek(today));
  const [selected, setSelected] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [rescheduleFor, setRescheduleFor] = useState<VetAppointment | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState('');

  const byDay = useMemo(() => {
    const map = new Map<string, VetAppointment[]>();
    for (const appointment of appointments) {
      const key = dateKey(apptDate(appointment));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(appointment);
    }
    Array.from(map.values()).forEach(dayAppointments => {
      dayAppointments.sort((a, b) => apptDate(a).getTime() - apptDate(b).getTime());
    });
    return map;
  }, [appointments]);

  const monthGrid = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    const cells: Array<Date | null> = [];
    for (let index = 0; index < startOffset; index += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthCursor]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekCursor, index)), [weekCursor]);
  const weekHours = useMemo(() => {
    const appointmentHours = weekDays.flatMap(day => (byDay.get(dateKey(day)) || []).map(appointment => apptDate(appointment).getHours()));
    const firstHour = Math.min(8, ...appointmentHours);
    const lastHour = Math.max(20, ...appointmentHours);
    return Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  }, [byDay, weekDays]);
  const selectedAppts = useMemo(() => byDay.get(dateKey(selected)) || [], [byDay, selected]);

  const openReschedule = (appointment: VetAppointment) => {
    if (!onReschedule || !RESCHEDULABLE.includes(appointment.status)) return;
    setRescheduleFor(appointment);
    setRescheduleAt(inputDateTime(apptDate(appointment)));
  };

  const submitReschedule = async () => {
    if (!onReschedule || !rescheduleFor || !rescheduleAt) return;
    const next = new Date(rescheduleAt);
    if (Number.isNaN(next.getTime())) return;
    try {
      await onReschedule(rescheduleFor, next.toISOString());
      setRescheduleFor(null);
      setRescheduleAt('');
    } catch {
      // La página muestra el error de la mutación; mantenemos el formulario abierto.
    }
  };

  const actionsFor = (appointment: VetAppointment) => {
    const actions = renderActions ? renderActions(appointment) : [];
    if (onReschedule && RESCHEDULABLE.includes(appointment.status)) {
      return [...actions, { label: 'Reprogramar', tone: 'neutral' as const, onClick: () => openReschedule(appointment) }];
    }
    return actions;
  };

  const move = (delta: number) => {
    if (view === 'month') setMonthCursor(cursor => new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    else setWeekCursor(cursor => addDays(cursor, delta * 7));
  };

  const changeView = (next: 'month' | 'week') => {
    setView(next);
    if (next === 'week') setWeekCursor(startOfWeek(selected));
    else setMonthCursor(new Date(selected.getFullYear(), selected.getMonth(), 1));
  };

  const weekEnd = weekDays[6];
  const periodLabel = view === 'month'
    ? `${MONTHS[monthCursor.getMonth()]} ${monthCursor.getFullYear()}`
    : `${weekCursor.getDate()} ${MONTHS[weekCursor.getMonth()].slice(0, 3)} – ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()].slice(0, 3)} ${weekEnd.getFullYear()}`;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, margin: 0 }}>{title}</h3>
          <div aria-label="Vista del calendario" style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: MPL.bg, border: `1px solid ${MPL.border}` }}>
            {(['month', 'week'] as const).map(option => (
              <button key={option} type="button" onClick={() => changeView(option)} aria-pressed={view === option}
                style={{ border: 0, borderRadius: 7, padding: '6px 11px', font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer', background: view === option ? '#fff' : 'transparent', color: view === option ? MPL.tealDark : MPL.muted, boxShadow: view === option ? '0 1px 4px rgba(30,60,55,.12)' : 'none' }}>
                {option === 'month' ? 'Mes' : 'Semana'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => move(-1)} aria-label={view === 'month' ? 'Mes anterior' : 'Semana anterior'} style={navBtn}><ChevronLeft size={18} /></button>
          <span style={{ fontWeight: 800, minWidth: view === 'month' ? 150 : 190, textAlign: 'center', textTransform: 'capitalize', fontSize: 13 }}>{periodLabel}</span>
          <button type="button" onClick={() => move(1)} aria-label={view === 'month' ? 'Mes siguiente' : 'Semana siguiente'} style={navBtn}><ChevronRight size={18} /></button>
        </div>
      </div>

      {view === 'month' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {WEEKDAYS.map(weekday => (
              <div key={weekday} style={{ textAlign: 'center', fontSize: 12, fontWeight: 800, color: MPL.faint, padding: '4px 0' }}>{weekday}</div>
            ))}
            {monthGrid.map((day, index) => {
              if (!day) return <div key={index} />;
              const dayAppointments = (byDay.get(dateKey(day)) || []).filter(appointment => appointment.status !== 'cancelled');
              const isToday = sameDay(day, today);
              const isSelected = sameDay(day, selected);
              return (
                <button key={index} type="button" onClick={() => setSelected(day)}
                  style={{
                    minHeight: 56, borderRadius: 10, padding: 5, textAlign: 'left', cursor: 'pointer',
                    border: isSelected ? `2px solid ${MPL.teal}` : `1px solid ${MPL.border}`,
                    background: isToday ? MPL.teal100 : '#fff', font: 'inherit',
                  }}>
                  <div style={{ fontSize: 12.5, fontWeight: isToday ? 800 : 600, color: MPL.ink }}>{day.getDate()}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 3 }}>
                    {dayAppointments.slice(0, 3).map(appointment => (
                      <span key={appointment._id} title={STATUS_META[appointment.status].label}
                        style={{ width: 7, height: 7, borderRadius: 999, background: STATUS_META[appointment.status].color }} />
                    ))}
                    {dayAppointments.length > 3 && <span style={{ fontSize: 9, color: MPL.faint }}>+{dayAppointments.length - 3}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: MPL.muted, marginBottom: 8 }}>
              {selected.getDate()} de {MONTHS[selected.getMonth()]}
            </div>
            {selectedAppts.length === 0 ? (
              <div style={{ color: MPL.faint, fontSize: 14 }}>Sin citas este día.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {selectedAppts.map(appointment => (
                  <AppointmentCard key={appointment._id} title={counterpartName(appointment)} appt={appointment} meta={STATUS_META} actions={actionsFor(appointment)} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: 720, border: `1px solid ${MPL.border}`, borderRadius: 14 }}>
          <div style={{ minWidth: 840 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(7, minmax(104px, 1fr))', position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: `1px solid ${MPL.border}` }}>
              <div style={{ padding: 10, color: MPL.faint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Clock3 size={16} /></div>
              {weekDays.map((day, index) => (
                <div key={dateKey(day)} style={{ padding: '8px 6px', textAlign: 'center', background: sameDay(day, today) ? MPL.teal100 : '#fff', borderLeft: `1px solid ${MPL.border}` }}>
                  <div style={{ color: MPL.faint, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{WEEKDAY_NAMES[index]}</div>
                  <div style={{ color: sameDay(day, today) ? MPL.tealDark : MPL.ink, fontSize: 18, fontWeight: 900 }}>{day.getDate()}</div>
                </div>
              ))}
            </div>
            {weekHours.map(hour => (
              <div key={hour} style={{ display: 'grid', gridTemplateColumns: '72px repeat(7, minmax(104px, 1fr))' }}>
                <div style={{ minHeight: 72, padding: '8px 9px', textAlign: 'right', color: MPL.faint, fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${MPL.border}` }}>
                  {String(hour).padStart(2, '0')}:00
                </div>
                {weekDays.map(day => {
                  const slotAppointments = (byDay.get(dateKey(day)) || []).filter(appointment => apptDate(appointment).getHours() === hour);
                  return (
                    <div key={`${dateKey(day)}-${hour}`} style={{ minHeight: 72, padding: 4, display: 'grid', alignContent: 'start', gap: 4, background: sameDay(day, today) ? `${MPL.teal100}66` : '#fff', borderLeft: `1px solid ${MPL.border}`, borderBottom: `1px solid ${MPL.border}` }}>
                      {slotAppointments.map(appointment => {
                        const status = STATUS_META[appointment.status];
                        const appointmentTime = apptDate(appointment);
                        const content = (
                          <>
                            <span style={{ fontSize: 10, fontWeight: 900 }}>{String(appointmentTime.getHours()).padStart(2, '0')}:{String(appointmentTime.getMinutes()).padStart(2, '0')}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 800 }}>{counterpartName(appointment)}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>{status.label}</span>
                          </>
                        );
                        const slotStyle: React.CSSProperties = { width: '100%', minWidth: 0, border: `1px solid ${status.color}`, borderRadius: 8, padding: '5px 6px', display: 'grid', textAlign: 'left', background: status.bg, color: status.color, opacity: appointment.status === 'cancelled' ? .7 : 1, font: 'inherit' };
                        return onReschedule && RESCHEDULABLE.includes(appointment.status) ? (
                          <button key={appointment._id} type="button" onClick={() => openReschedule(appointment)} title={`${counterpartName(appointment)} · ${appointment.reason} · Reprogramar`} style={{ ...slotStyle, cursor: 'pointer' }}>
                            {content}
                          </button>
                        ) : (
                          <div key={appointment._id} title={`${counterpartName(appointment)} · ${appointment.reason}`} style={slotStyle}>
                            {content}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {rescheduleFor && onReschedule && (
        <div role="dialog" aria-label="Reprogramar cita" style={{ marginTop: 16, padding: 14, borderRadius: 14, background: MPL.bg, border: `1px solid ${MPL.border}`, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <CalendarRange size={18} color={MPL.teal} />
            <div>
              <div style={{ fontWeight: 900 }}>Reprogramar cita con {counterpartName(rescheduleFor)}</div>
              <div style={{ color: MPL.muted, fontSize: 12 }}>{rescheduleFor.reason}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'end', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 5, color: MPL.muted, fontSize: 12, fontWeight: 800 }}>
              Nueva fecha y hora
              <input type="datetime-local" value={rescheduleAt} onChange={event => setRescheduleAt(event.target.value)} style={inputStyle} />
            </label>
            <button type="button" disabled={!rescheduleAt || rescheduling} onClick={() => void submitReschedule()}
              style={{ background: MPL.teal, color: '#fff', border: 0, borderRadius: 10, padding: '10px 14px', font: 'inherit', fontWeight: 800, fontSize: 13, cursor: rescheduling ? 'wait' : 'pointer', opacity: !rescheduleAt || rescheduling ? .6 : 1 }}>
              {rescheduling ? 'Guardando…' : 'Proponer nueva fecha'}
            </button>
            <button type="button" disabled={rescheduling} onClick={() => { setRescheduleFor(null); setRescheduleAt(''); }}
              style={{ background: '#fff', color: MPL.ink, border: `1.5px solid ${MPL.border}`, borderRadius: 10, padding: '9px 14px', font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
          <div style={{ color: MPL.faint, fontSize: 11.5 }}>Al guardar, el cliente recibirá el mismo aviso por email que desde la agenda de citas.</div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 9, border: `1px solid ${MPL.border}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: MPL.ink };
