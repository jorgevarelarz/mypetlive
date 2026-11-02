import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Check, PawPrint } from 'lucide-react';
import { M } from '../pet/maqueta';
import { toAbsoluteUrl } from '../../utils/media';
import { petAge } from '../../utils/age';
import { speciesLabel } from '../../styles/mypetlive';
import { listMyPets } from '../../api/animals';
import { createVetAppointment, getVetAvailability, listVets } from '../../api/vetAppointments';
import {
  CalcoCitasCampana, CalcoCitasConfirmar, CalcoCitasDetalles, CalcoCitasFecha, CalcoCitasHora,
  CalcoCitasMotivo, CalcoCitasServicio, CalcoDestellosNaranjas,
} from '../icons/calcados';

// Reservar cita con el veterinario, calcado de la maqueta «Citas» (2 nov 2026):
// mascota en tarjetas, calendario con los días que tienen hueco en verde, horas
// libres, servicio y motivo, y «Confirmar cita».
//
// Tamaños a escala normal de iPhone, NO los de la maqueta: copiados tal cual
// salían más pequeños que el resto de la app (pasó con la barra de abajo).
// Títulos de sección 17, textos 14-15, botón 17, como el panel de la protectora.
//
// Los huecos los da el servidor (GET /api/vets/:id/availability) a partir de la
// agenda del veterinario y de las citas ya pedidas.

const TARJETA: React.CSSProperties = { background: M.tarjeta, borderRadius: 18, boxShadow: M.sombra, border: '1px solid #F1EBE2', padding: '16px 16px 18px' };
const TITULO: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontFamily: M.titulos, fontSize: 17, fontWeight: 700, color: M.tinta };
const VERDE = '#0E5F5B';
const VERDE_CLARO = '#E3F0DC';
const BORDE = '#E4DED3';
const SELECT: React.CSSProperties = {
  width: '100%', height: 46, borderRadius: 12, border: `1px solid ${BORDE}`, background: '#FFFFFF',
  font: 'inherit', fontSize: 15, color: M.tinta, padding: '0 34px 0 40px', appearance: 'none', WebkitAppearance: 'none',
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%231E2A27' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MOTIVOS = ['Revisión general', 'Vacunas', 'Desparasitación', 'No se encuentra bien', 'Control o seguimiento', 'Otro'];
const SERVICIO_GENERICO = 'Consulta veterinaria';

const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

/** «2026-11-12» + «12:00» en hora de España → ISO (el servidor lo vuelve a comprobar). */
function madridIso(fecha: string, hora: string) {
  const [y, m, d] = fecha.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off = (t: number) => {
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t))) p[x.type] = x.value;
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  let t = guess - off(guess);
  t = guess - off(t);
  return new Date(t).toISOString();
}

function Radio({ activo }: { activo: boolean }) {
  return activo ? (
    <span style={{ width: 26, height: 26, borderRadius: 999, background: VERDE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Check size={16} color="#FFFFFF" strokeWidth={3} />
    </span>
  ) : (
    <span style={{ width: 24, height: 24, borderRadius: 999, border: '2px solid #B7B1A6', flexShrink: 0 }} />
  );
}

export default function ReservarCita() {
  const queryClient = useQueryClient();
  const petsQ = useQuery({ queryKey: ['my-pets'], queryFn: listMyPets });
  const vetsQ = useQuery({ queryKey: ['vets-directory'], queryFn: () => listVets(), staleTime: 60_000 });

  const pets = (petsQ.data?.items || []).map((i: any) => i.animal).filter((a: any) => a && !a.memorial?.active);
  const vets = vetsQ.data?.items || [];

  const [petId, setPetId] = React.useState<string | null>(null);
  const [vetId, setVetId] = React.useState<string>('');
  const hoy = hoyMadrid();
  const [mes, setMes] = React.useState(() => ({ y: Number(hoy.slice(0, 4)), m: Number(hoy.slice(5, 7)) - 1 }));
  const [fecha, setFecha] = React.useState<string | null>(null);
  const [hora, setHora] = React.useState<string | null>(null);
  const [servicio, setServicio] = React.useState('');
  const [motivo, setMotivo] = React.useState(MOTIVOS[0]);
  const [notas, setNotas] = React.useState('');

  // La primera mascota y, si solo hay una clínica, esa: lo normal es no tener que tocar nada.
  React.useEffect(() => { if (!petId && pets.length) setPetId(String(pets[0]._id)); }, [pets, petId]);
  React.useEffect(() => { if (!vetId && vets.length) setVetId(vets[0]._id); }, [vets, vetId]);

  const vet = vets.find(v => v._id === vetId);
  const catalogo = vet?.serviceCatalog || [];
  React.useEffect(() => { setServicio(catalogo[0]?.name || ''); setFecha(null); setHora(null); }, [vetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const diasMes = new Date(Date.UTC(mes.y, mes.m + 1, 0)).getUTCDate();
  const huecosQ = useQuery({
    queryKey: ['vet-availability', vetId, mes.y, mes.m],
    queryFn: () => getVetAvailability(vetId, ymd(mes.y, mes.m, 1), diasMes),
    enabled: Boolean(vetId),
    staleTime: 30_000,
  });
  const horasDe = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const d of huecosQ.data?.dias || []) map.set(d.fecha, d.horas);
    return map;
  }, [huecosQ.data]);

  // Al cambiar de mes o de clínica, la primera fecha con hueco queda elegida.
  React.useEffect(() => {
    if (!huecosQ.data) return;
    if (fecha && (horasDe.get(fecha) || []).length) return;
    const primera = huecosQ.data.dias.find(d => d.horas.length);
    setFecha(primera?.fecha || null);
    setHora(null);
  }, [huecosQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const horas = fecha ? horasDe.get(fecha) || [] : [];
  React.useEffect(() => { if (hora && !horas.includes(hora)) setHora(null); }, [horas, hora]);

  const esteMes = Number(hoy.slice(0, 4)) === mes.y && Number(hoy.slice(5, 7)) - 1 === mes.m;
  const cambiarMes = (delta: number) => setMes(({ y, m }) => {
    const n = new Date(Date.UTC(y, m + delta, 1));
    return { y: n.getUTCFullYear(), m: n.getUTCMonth() };
  });

  const crear = useMutation({
    mutationFn: () => {
      const pet = pets.find((p: any) => String(p._id) === petId);
      const reason = notas.trim() ? `${motivo}. ${notas.trim()}` : motivo;
      return createVetAppointment({
        vetId,
        reason,
        requestedAt: madridIso(fecha as string, hora as string),
        animalCode: pet?.code || undefined,
        serviceName: catalogo.some(s => s.name === servicio) ? servicio : undefined,
      });
    },
    onSuccess: () => {
      toast.success(`Cita pedida para el ${Number(fecha!.slice(8))} de ${MESES[Number(fecha!.slice(5, 7)) - 1]} a las ${hora}. La clínica te la confirmará.`);
      setHora(null);
      setNotas('');
      queryClient.invalidateQueries({ queryKey: ['my-vet-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['vet-availability', vetId] });
    },
    onError: (e: any) => {
      const code = e?.response?.data?.error;
      if (code === 'slot_taken') {
        toast.error('Alguien acaba de pedir esa hora. Elige otra.');
        queryClient.invalidateQueries({ queryKey: ['vet-availability', vetId] });
        return;
      }
      toast.error(code === 'animal_not_owned' ? 'Esa mascota no es tuya.' : 'No se ha podido pedir la cita. Inténtalo de nuevo.');
    },
  });

  // Rejilla del mes: empieza en lunes; los días del mes anterior y siguiente, en gris.
  const primerDia = new Date(Date.UTC(mes.y, mes.m, 1)).getUTCDay() || 7;
  const celdas: Array<{ dia: number; fecha?: string; fuera: boolean }> = [];
  const diasMesAnterior = new Date(Date.UTC(mes.y, mes.m, 0)).getUTCDate();
  for (let i = primerDia - 1; i > 0; i--) celdas.push({ dia: diasMesAnterior - i + 1, fuera: true });
  for (let d = 1; d <= diasMes; d++) celdas.push({ dia: d, fecha: ymd(mes.y, mes.m, d), fuera: false });

  const puede = Boolean(vetId && fecha && hora && (petId || !pets.length)) && !crear.isPending;

  return (
    <div style={{ display: 'grid', gap: 12, fontFamily: M.letra, color: M.tinta }}>
      {/* Para qué mascota */}
      <div style={TARJETA}>
        <h2 style={{ ...TITULO, fontSize: 16.5 }}>¿Para qué mascota es la cita?</h2>
        {petsQ.isLoading ? (
          <p style={{ margin: '10px 0 0', fontSize: 14, color: M.gris }}>Cargando tus mascotas…</p>
        ) : pets.length === 0 ? (
          <p style={{ margin: '10px 0 0', fontSize: 14, color: M.gris }}>Aún no tienes mascotas registradas. Puedes pedir la cita igual y contárselo en las notas.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
            {pets.map((p: any) => {
              const activo = String(p._id) === petId;
              const foto = p.images?.[0];
              return (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => setPetId(String(p._id))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '10px 8px 10px 10px', borderRadius: 16, cursor: 'pointer', textAlign: 'left',
                    border: activo ? `2px solid ${VERDE}` : `1px solid ${BORDE}`, background: activo ? VERDE_CLARO : '#FFFFFF',
                  }}
                >
                  <span style={{ width: 42, height: 42, borderRadius: 999, overflow: 'hidden', background: '#F1ECE4', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {foto ? <img src={toAbsoluteUrl(foto)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <PawPrint size={20} color={M.verde} />}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {/* A tamaño normal no cabe en una línea junto a la foto y el círculo: que baje. */}
                    <span style={{ display: 'block', fontSize: 13, lineHeight: '16px', color: M.gris }}>
                      {[speciesLabel(p.species), petAge(p)].filter(Boolean).map((t, i) => <React.Fragment key={i}>{i ? ' · ' : ''}<span style={{ whiteSpace: 'nowrap' }}>{t}</span></React.Fragment>)}
                    </span>
                  </span>
                  <Radio activo={activo} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Fecha */}
      <div style={TARJETA}>
        <h2 style={TITULO}><CalcoCitasFecha size={22} /> Elige una fecha</h2>

        {vetsQ.isLoading ? null : vets.length === 0 ? (
          <p style={{ margin: '10px 0 0', fontSize: 14, color: M.gris }}>Todavía no hay clínicas veterinarias en MyPetLive.</p>
        ) : vets.length > 1 ? (
          <label style={{ display: 'grid', gap: 6, marginTop: 12, fontSize: 13.5, color: M.gris }}>
            Clínica
            <select value={vetId} onChange={e => setVetId(e.target.value)} style={{ ...SELECT, paddingLeft: 14 }}>
              {vets.map(v => <option key={v._id} value={v._id}>{v.name}{v.city ? ` · ${v.city}` : ''}</option>)}
            </select>
          </label>
        ) : (
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: M.gris }}>{vet?.name}{vet?.city ? ` · ${vet.city}` : ''}</p>
        )}

        {vetId && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, margin: '14px 0 10px' }}>
              <button type="button" aria-label="Mes anterior" disabled={esteMes} onClick={() => cambiarMes(-1)}
                style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${BORDE}`, background: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: esteMes ? 0.4 : 1, cursor: 'pointer' }}>
                <ChevronLeft size={18} color={M.tinta} />
              </button>
              <span style={{ minWidth: 150, textAlign: 'center', fontFamily: M.titulos, fontSize: 17, fontWeight: 700, color: '#17352D' }}>
                {MESES[mes.m][0].toUpperCase() + MESES[mes.m].slice(1)} {mes.y}
              </span>
              <button type="button" aria-label="Mes siguiente" onClick={() => cambiarMes(1)}
                style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${BORDE}`, background: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <ChevronRight size={18} color={M.tinta} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                <span key={d} style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: M.gris, paddingBottom: 2 }}>{d}</span>
              ))}
              {celdas.map((c, i) => {
                const libre = !c.fuera && (horasDe.get(c.fecha!) || []).length > 0;
                const activo = !c.fuera && c.fecha === fecha;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!libre}
                    onClick={() => { setFecha(c.fecha!); setHora(null); }}
                    aria-pressed={activo}
                    aria-label={c.fuera ? undefined : `${c.dia}${libre ? ', con huecos' : ', sin huecos'}`}
                    style={{
                      height: 40, borderRadius: 10, fontSize: 15, cursor: libre ? 'pointer' : 'default', padding: 0,
                      fontWeight: activo ? 800 : 500,
                      border: activo || libre || c.fuera ? '1px solid transparent' : `1px solid ${BORDE}`,
                      background: activo ? VERDE : libre ? VERDE_CLARO : c.fuera ? '#EFECE6' : '#FFFFFF',
                      color: activo ? '#FFFFFF' : c.fuera ? '#B9B4AA' : M.tinta,
                    }}
                  >
                    {c.dia}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '6px 16px', marginTop: 12, fontSize: 12.5, color: M.gris }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: VERDE }} /> Día seleccionado</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: VERDE_CLARO }} /> Día disponible</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${BORDE}`, background: '#FFFFFF' }} /> No disponible</span>
            </div>
            {huecosQ.isError && (
              <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#B3261E' }}>
                No hemos podido cargar los huecos libres. <button type="button" onClick={() => huecosQ.refetch()} style={{ border: 0, background: 'none', padding: 0, color: VERDE, fontWeight: 700, textDecoration: 'underline' }}>Reintentar</button>
              </p>
            )}
            {huecosQ.data && !huecosQ.data.dias.some(d => d.horas.length) && (
              <p style={{ margin: '10px 0 0', fontSize: 13.5, color: M.gris }}>Este mes ya no quedan huecos. Mira el mes siguiente.</p>
            )}
          </>
        )}
      </div>

      {/* Hora */}
      <div style={TARJETA}>
        <h2 style={TITULO}><CalcoCitasHora size={22} /> Elige una hora</h2>
        {!fecha ? (
          <p style={{ margin: '10px 0 0', fontSize: 14, color: M.gris }}>Elige primero un día.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
            {horas.map(h => {
              const activo = h === hora;
              return (
                <button key={h} type="button" onClick={() => setHora(h)} aria-pressed={activo}
                  style={{
                    height: 42, borderRadius: 999, fontSize: 15, cursor: 'pointer', padding: 0,
                    fontWeight: activo ? 800 : 500, color: activo ? '#17352D' : M.tinta,
                    border: activo ? `2px solid ${VERDE}` : `1px solid ${BORDE}`, background: activo ? VERDE_CLARO : '#FFFFFF',
                  }}>
                  {h}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detalles */}
      <div style={TARJETA}>
        <h2 style={TITULO}><CalcoCitasDetalles size={22} /> Detalles de la cita</h2>
        {/* En la maqueta van lado a lado; a tamaño normal el texto no cabía («Consulta ge…»). */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13.5, color: '#3D4340', minWidth: 0 }}>
            Servicio
            <span style={{ position: 'relative', display: 'block' }}>
              <CalcoCitasServicio size={18} style={{ position: 'absolute', left: 12, top: 14, pointerEvents: 'none' }} />
              <select value={servicio} onChange={e => setServicio(e.target.value)} style={SELECT} disabled={!catalogo.length}>
                {catalogo.length ? catalogo.map(s => <option key={s.name} value={s.name}>{s.name}</option>) : <option value="">{SERVICIO_GENERICO}</option>}
              </select>
            </span>
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13.5, color: '#3D4340', minWidth: 0 }}>
            Motivo de la visita
            <span style={{ position: 'relative', display: 'block' }}>
              <CalcoCitasMotivo size={18} style={{ position: 'absolute', left: 12, top: 14, pointerEvents: 'none' }} />
              <select value={motivo} onChange={e => setMotivo(e.target.value)} style={SELECT}>
                {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </span>
          </label>
        </div>
        <label style={{ display: 'grid', gap: 6, marginTop: 12, fontSize: 13.5, color: '#3D4340' }}>
          Notas (opcional)
          <span style={{ position: 'relative', display: 'block' }}>
            <textarea
              value={notas}
              maxLength={200}
              onChange={e => setNotas(e.target.value)}
              placeholder="Ej. Control anual, vacunas, síntomas…"
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 76, borderRadius: 12, border: `1px solid ${BORDE}`, padding: '10px 12px 22px', font: 'inherit', fontSize: 15, resize: 'vertical', background: '#FFFFFF' }}
            />
            <span style={{ position: 'absolute', right: 12, bottom: 10, fontSize: 12, color: M.gris }}>{notas.length}/200</span>
          </span>
        </label>
      </div>

      <button
        type="button"
        disabled={!puede}
        onClick={() => crear.mutate()}
        style={{
          height: 56, borderRadius: 999, border: 0, background: VERDE, color: '#FFFFFF', cursor: puede ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: M.titulos, fontSize: 17.5, fontWeight: 700,
          opacity: puede || crear.isPending ? 1 : 0.55, boxShadow: '0 6px 16px -10px rgba(14,95,91,.7)',
        }}
      >
        <CalcoCitasConfirmar size={24} color="#FFFFFF" />
        {crear.isPending ? 'Pidiendo la cita…' : 'Confirmar cita'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 16, background: '#E6EFE6' }}>
        <CalcoCitasCampana size={24} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: M.titulos, fontSize: 15.5, fontWeight: 700, color: '#17352D' }}>No olvides</span>
          <span style={{ display: 'block', fontSize: 14, color: '#3D4340' }}>Recibirás un recordatorio 24 h antes de tu cita.</span>
        </span>
        <CalcoDestellosNaranjas size={20} />
      </div>
    </div>
  );
}
