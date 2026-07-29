import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { CalendarPlus, MapPin, ShieldAlert, Clock } from 'lucide-react';
import {
  listVets,
  listMyVetAppointments,
  createVetAppointment,
  updateVetAppointmentStatus,
  VetCatalogService,
} from '../../api/vetAppointments';
import { getMyPatitas } from '../../api/patitas';
import { listMyPets, searchAnimals } from '../../api/animals';
import { useAuth } from '../../context/AuthContext';
import { MPL, MPL_FONT_DISPLAY, MPL_FONT_MONO } from '../../styles/mypetlive';
import { STATUS_META, AppointmentCard, LoadError, promptCancelReason, datetimeLocalNow } from './appointmentShared';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };
const inputStyle: React.CSSProperties = { border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 13px', font: 'inherit', width: '100%', boxSizing: 'border-box', background: '#fff' };

// Etiqueta de precio de un servicio del catálogo: "30 €" (fijo), "desde 30 €" o "Presupuesto".
export function servicePriceLabel(s: VetCatalogService) {
  if (s.priceEur == null) return 'Presupuesto';
  const eur = `${s.priceEur.toLocaleString('es-ES')} €`;
  return s.pricingType === 'fijo' ? eur : `desde ${eur}`;
}

export default function BookVetAppointment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isShelter = user?.role === 'landlord';
  const [vetId, setVetId] = useState('');
  const [animalCode, setAnimalCode] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [reason, setReason] = useState('');
  const [requestedAt, setRequestedAt] = useState('');
  const [patitasCost, setPatitasCost] = useState('');

  const vetsQ = useQuery({ queryKey: ['vets-directory'], queryFn: () => listVets(), staleTime: 60_000 });
  const apptsQ = useQuery({ queryKey: ['my-vet-appointments'], queryFn: () => listMyVetAppointments() });

  // Solo se puede agendar para mascotas propias: adoptante → sus mascotas; protectora → animales de su protectora.
  const petsQ = useQuery({
    queryKey: ['my-pets-for-appointment', isShelter, user?._id],
    enabled: !!user,
    queryFn: async () => {
      if (isShelter) {
        const res = await searchAnimals({ shelter: String(user?._id || ''), limit: 200 });
        return (res.items || []).map((a: any) => ({ code: a.code, name: a.name, species: a.species }));
      }
      const res = await listMyPets();
      return (res.items || []).map(p => ({ code: p.animal?.code, name: p.animal?.name, species: p.animal?.species }));
    },
  });
  const myPets = (petsQ.data || []).filter(p => p.code);
  const patitasQ = useQuery({ queryKey: ['my-patitas'], queryFn: getMyPatitas, enabled: isShelter });
  // Lo que se puede comprometer es el disponible, no el saldo bruto: lo ya
  // comprometido en otras citas está bloqueado hasta que se completen o cancelen.
  const balance = patitasQ.data?.available ?? patitasQ.data?.balance ?? 0;
  const lockedPatitas = patitasQ.data?.locked ?? 0;
  const vets = vetsQ.data?.items || [];
  const selectedVet = vets.find(v => v._id === vetId);
  const catalog = selectedVet?.serviceCatalog || [];

  // Al elegir servicio: prefill del motivo si está vacío y, para protectoras,
  // sugerencia del coste en Patitas a partir del precio en € (1 Patita = 0,10 €).
  const onSelectService = (name: string) => {
    setServiceName(name);
    const svc = catalog.find(s => s.name === name);
    if (!svc) return;
    if (!reason.trim()) setReason(svc.name);
    if (isShelter && svc.priceEur != null && !patitasCost) {
      setPatitasCost(String(Math.max(0, Math.round(svc.priceEur / 0.1))));
    }
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!vetId) throw new Error('vet_required');
      if (!reason.trim()) throw new Error('reason_required');
      if (!requestedAt) throw new Error('date_required');
      const cost = isShelter && patitasCost ? Math.max(0, Math.round(Number(patitasCost))) : undefined;
      if (cost && cost > balance) throw new Error('insufficient');
      return createVetAppointment({ vetId, reason: reason.trim(), requestedAt: new Date(requestedAt).toISOString(), animalCode: animalCode.trim() || undefined, serviceName: serviceName || undefined, patitasCost: cost });
    },
    onSuccess: () => {
      toast.success('Solicitud de cita enviada');
      setReason(''); setRequestedAt(''); setAnimalCode(''); setPatitasCost(''); setServiceName('');
      queryClient.invalidateQueries({ queryKey: ['my-vet-appointments'] });
    },
    onError: (e: any) => {
      const code = e?.response?.data?.error || e?.message;
      const map: Record<string, string> = {
        vet_required: 'Elige un veterinario', reason_required: 'Indica el motivo', date_required: 'Elige fecha y hora',
        date_in_past: 'La fecha no puede ser pasada', animal_not_found: 'No existe ese código de mascota',
        animal_not_owned: 'Solo puedes pedir cita para tus propias mascotas',
        insufficient: 'No tienes suficientes Patitas', insufficient_patitas: 'No tienes suficientes Patitas',
        service_not_found: 'Ese servicio ya no está en el catálogo del veterinario',
      };
      toast.error(map[code] || 'No se pudo crear la solicitud');
    },
  });

  const cancelMut = useMutation({
    mutationFn: (vars: { id: string; cancelReason?: string }) => updateVetAppointmentStatus(vars.id, { status: 'cancelled', cancelReason: vars.cancelReason }),
    onSuccess: () => { toast.success('Cita cancelada'); queryClient.invalidateQueries({ queryKey: ['my-vet-appointments'] }); },
    onError: (e: any) => {
      if (e?.response?.data?.error === 'invalid_transition') {
        toast.error('Esta cita ya ha cambiado de estado. Actualizamos la lista.');
        queryClient.invalidateQueries({ queryKey: ['my-vet-appointments'] });
        return;
      }
      toast.error('No se pudo cancelar');
    },
  });

  const cancel = (id: string, vetName: string) => {
    const extra = promptCancelReason(vetName);
    if (!extra) return;
    cancelMut.mutate({ id, ...extra });
  };

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
          {/* Sin esto, un fallo de red dejaba el desplegable vacío y sin explicación:
              el usuario no podía pedir cita y no sabía por qué. */}
          {vetsQ.isError ? (
            <LoadError title="No hemos podido cargar el listado de veterinarios." onRetry={() => vetsQ.refetch()} />
          ) : (
            <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
              Veterinario
              <select value={vetId} onChange={e => { setVetId(e.target.value); setServiceName(''); }} style={inputStyle}>
                <option value="">
                  {vetsQ.isLoading ? 'Cargando…' : vets.length === 0 ? 'Todavía no hay veterinarios disponibles' : 'Elige un veterinario'}
                </option>
                {vets.map(v => (
                  <option key={v._id} value={v._id}>{v.name}{v.city ? ` · ${v.city}` : ''}{v.emergency24h ? ' · Urgencias 24h' : ''}</option>
                ))}
              </select>
            </label>
          )}

          {selectedVet && (
            <div style={{ background: MPL.bg, borderRadius: 12, padding: 12, fontSize: 13, color: MPL.muted, display: 'grid', gap: 6 }}>
              {selectedVet.city && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={14} /> {selectedVet.city}</div>}
              {selectedVet.schedule && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} /> {selectedVet.schedule}</div>}
              {selectedVet.emergency24h && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: MPL.coralDark, fontWeight: 700 }}><ShieldAlert size={14} /> Urgencias 24 h</div>}
              {selectedVet.services.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{selectedVet.services.map(s => <span key={s} style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 999, padding: '2px 9px', fontSize: 12 }}>{s}</span>)}</div>}
              {(selectedVet.serviceCatalog || []).length > 0 && (
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontWeight: 800, fontSize: 12.5, color: MPL.ink }}>Tarifas</div>
                  {(selectedVet.serviceCatalog || []).map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 10, padding: '5px 10px', fontSize: 12.5 }}>
                      <span>{s.name}</span>
                      <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{servicePriceLabel(s)}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 11.5, color: MPL.faint }}>Precios informativos. El pago se hace en la clínica.</div>
                </div>
              )}
            </div>
          )}

          {catalog.length > 0 && (
            <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
              Servicio (opcional)
              <select value={serviceName} onChange={e => onSelectService(e.target.value)} style={inputStyle}>
                <option value="">Sin especificar</option>
                {catalog.map(s => (
                  <option key={s.name} value={s.name}>{s.name} · {servicePriceLabel(s)}</option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
              Mascota (opcional)
              <select
                value={animalCode}
                onChange={e => setAnimalCode(e.target.value)}
                disabled={petsQ.isLoading || petsQ.isError || myPets.length === 0}
                style={{ ...inputStyle, fontFamily: animalCode ? MPL_FONT_MONO : 'inherit' }}
              >
                <option value="">
                  {petsQ.isLoading ? 'Cargando…'
                    : petsQ.isError ? 'No se pudo cargar tu lista'
                    : myPets.length === 0 ? 'No tienes mascotas registradas'
                    : 'Sin especificar'}
                </option>
                {myPets.map(p => (
                  <option key={p.code} value={p.code}>{p.name}{p.code ? ` · ${p.code}` : ''}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
              Fecha y hora
              <input type="datetime-local" min={datetimeLocalNow()} value={requestedAt} onChange={e => setRequestedAt(e.target.value)} style={inputStyle} />
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
                Disponible: {balance} Patitas{lockedPatitas > 0 ? ` (${lockedPatitas} ya comprometidas en otras citas)` : ''}
                {patitasCost ? ` · comprometerás ${Math.max(0, Math.round(Number(patitasCost)))} (≈ ${(Math.max(0, Math.round(Number(patitasCost))) * 0.1).toFixed(2)} €)` : ''}.
                {' '}Se bloquean al pedir la cita y se abonan al veterinario cuando la complete. Si se cancela, se liberan.
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
        ) : apptsQ.isError ? (
          <LoadError title="No hemos podido cargar tus citas." onRetry={() => apptsQ.refetch()} />
        ) : appts.length === 0 ? (
          <div style={{ color: MPL.faint, fontSize: 14 }}>Aún no tienes citas. Pide una arriba 👆</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {appts.map(a => {
              const vetName = a.vetId?.profile?.orgName || a.vetId?.name || 'Veterinario';
              return (
                <AppointmentCard
                  key={a._id}
                  title={vetName}
                  appt={a}
                  meta={STATUS_META}
                  actions={['requested', 'confirmed', 'rescheduled'].includes(a.status) && !cancelMut.isPending
                    ? [{ label: 'Cancelar', tone: 'danger', onClick: () => cancel(a._id, vetName) }]
                    : []}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
