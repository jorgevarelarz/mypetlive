import React from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { listMyPets, markMedicationDose, updateMyPet, type BodyCondition, type HealthCategory } from '../../api/animals';
import { listMyVetAppointments } from '../../api/vetAppointments';
import { healthCategoryLabel, medicationSummary } from '../../styles/mypetlive';
import { estadoToma } from '../../utils/medicationDoses';
import { loadSelectedPet, saveSelectedPet } from '../../utils/selectedPet';
import PetSwitcher from '../../components/pet/PetSwitcher';
import HealthEntrySheet from '../../components/pet/HealthEntrySheet';
import { M } from '../../components/pet/maqueta';
import { useDialog } from '../../hooks/useDialog';
import {
  CalcoCuiAlerta, CalcoCuiBtnDesparasitacion, CalcoCuiBtnMedicacion, CalcoCuiBtnVacuna, CalcoCuiCita, CalcoCuiCitaPequena,
  CalcoCuiCondicion, CalcoCuiConsejos, CalcoCuiDatos, CalcoCuiDesparasitacion, CalcoCuiHistorial, CalcoCuiPedir, CalcoCuiPeso,
  CalcoCuiRegistra, CalcoCuiSalud, CalcoCuiVacunas,
} from '../../components/icons/calcados';

// «Cuidados» (maqueta de Jorge, 2 nov 2026): la salud de una mascota en un solo
// sitio. Todo sale de lo que ya hay apuntado: citas (vet-appointments), el
// historial de salud con sus próximas fechas, y el peso y la condición, que se
// apuntan aquí. A tamaño normal de iPhone, no a las medidas de la maqueta.

const TARJETA: React.CSSProperties = { background: '#FEFEFE', border: '1px solid #EEE9E1', borderRadius: 22, boxShadow: '0 8px 22px -16px rgba(60,45,30,.3)' };
const TITULO: React.CSSProperties = { margin: 0, fontFamily: M.titulos, fontSize: 19, fontWeight: 800, color: '#14231F' };
const GRIS = '#5E6460';
const CONDICIONES: Array<{ valor: BodyCondition; texto: string }> = [
  { valor: 'muy_delgado', texto: 'Muy delgado' },
  { valor: 'delgado', texto: 'Delgado' },
  { valor: 'bueno', texto: 'Bueno' },
  { valor: 'sobrepeso', texto: 'Sobrepeso' },
  { valor: 'obesidad', texto: 'Obesidad' },
];
const DIA = 86_400_000;

const fechaCorta = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '') : '');
// Las citas van en hora de España (la de la clínica), esté donde esté el móvil (AUD-2).
const fechaCita = (d: string | Date) => {
  const t = new Date(d);
  const dia = t.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).replace(/\./g, '');
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} · ${t.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}`;
};
const REINTENTAR: React.CSSProperties = { border: 0, background: 'none', padding: 0, color: '#0E5F5B', font: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' };
const haceCuanto = (d?: string | null) => {
  if (!d) return '';
  const dias = Math.floor((Date.now() - new Date(d).getTime()) / DIA);
  if (dias < 1) return 'hoy';
  if (dias < 31) return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  const meses = Math.floor(dias / 30);
  return meses < 12 ? `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}` : `hace ${Math.floor(meses / 12)} ${meses < 24 ? 'año' : 'años'}`;
};

/** «Polivalente (moquillo, parvovirus…)» → «Polivalente»: lo justo para un aviso o un consejo. */
const nombreCorto = (notas?: string) => {
  const t = String(notas || '').split('(')[0].trim();
  return t.length > 28 ? `${t.slice(0, 27)}…` : t;
};

/** La última entrada de cada «cosa» (misma categoría y mismo detalle): es la que manda en la próxima fecha. */
function ultimasPorCosa(entradas: any[], tipo: string) {
  const porCosa = new Map<string, any>();
  for (const e of entradas.filter(x => x.type === tipo)) {
    const clave = String(e.notes || '').trim().toLowerCase();
    const previa = porCosa.get(clave);
    if (!previa || new Date(e.date).getTime() > new Date(previa.date).getTime()) porCosa.set(clave, e);
  }
  return Array.from(porCosa.values());
}

function Fila({ icono, fondo, titulo, subtitulo, children, to }: { icono: React.ReactNode; fondo: string; titulo: string; subtitulo: string; children?: React.ReactNode; to?: string }) {
  const contenido = (
    <div style={{ ...TARJETA, display: 'grid', gridTemplateColumns: '58px minmax(0, 1fr) 18px', alignItems: 'center', gap: 14, padding: 16 }}>
      <span style={{ width: 58, height: 58, borderRadius: 16, background: fondo, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'start' }}>{icono}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: M.titulos, fontSize: 18, fontWeight: 800, color: '#14231F' }}>{titulo}</span>
        <span style={{ display: 'block', fontSize: 15, color: GRIS, marginTop: 2 }}>{subtitulo}</span>
        {children}
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3D4340" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>{contenido}</Link> : contenido;
}

const Visto = () => (
  <span aria-hidden style={{ width: 26, height: 26, borderRadius: 999, background: '#DDEEDF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F6B4F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  </span>
);

export default function CuidadosPage() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const petsQ = useQuery({ queryKey: ['my-pets'], queryFn: listMyPets });
  const citasQ = useQuery({ queryKey: ['my-vet-appointments'], queryFn: () => listMyVetAppointments() });
  const mascotas = (petsQ.data?.items || []).map((i: any) => i.animal).filter((a: any) => a && !a.memorial?.active);

  const [elegida, setElegidaState] = React.useState<string | null>(() => params.get('mascota') || loadSelectedPet());
  const setElegida = (id: string) => { setElegidaState(id); saveSelectedPet(id); if (params.get('mascota')) { params.delete('mascota'); setParams(params, { replace: true }); } };
  const pet: any = mascotas.find((p: any) => String(p._id) === elegida) || mascotas[0];

  const [apuntar, setApuntar] = React.useState<{ tipo?: HealthCategory; entrada?: any } | null>(null);
  const [verTodo, setVerTodo] = React.useState(false);
  const [consejo, setConsejo] = React.useState(0);
  const [editarDatos, setEditarDatos] = React.useState(false);
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['my-pets'] });
  const marcarToma = useMutation({
    mutationFn: (v: { code: string; id: string }) => markMedicationDose(v.code, v.id),
    onSuccess: () => { toast.success('Toma apuntada'); refrescar(); },
    onError: () => { toast.error('No se ha podido apuntar. Inténtalo de nuevo.'); },
  });

  if (petsQ.isLoading) return <div style={{ padding: 20, color: GRIS }}>Cargando…</div>;
  if (petsQ.isError) {
    return (
      <div style={{ padding: 20, fontFamily: M.letra, color: '#B3261E', fontSize: 15 }}>
        No hemos podido cargar tus mascotas. <button type="button" onClick={() => petsQ.refetch()} style={REINTENTAR}>Reintentar</button>
      </div>
    );
  }
  if (!pet) {
    return (
      <div style={{ display: 'grid', gap: 12, padding: '8px 4px', fontFamily: M.letra }}>
        <h1 style={{ margin: 0, fontFamily: M.titulos, fontSize: 30, fontWeight: 800, color: '#14231F' }}>Cuidados</h1>
        <p style={{ margin: 0, fontSize: 15, color: GRIS }}>Registra tu mascota para llevar aquí sus vacunas, citas y cuidados.</p>
        <Link to="/pet?nueva=1" style={{ justifySelf: 'start', padding: '12px 18px', borderRadius: 14, background: '#0E5F5B', color: '#fff', fontWeight: 800, textDecoration: 'none' }}>Registrar mi mascota</Link>
      </div>
    );
  }

  const ahora = Date.now();
  const salud: any[] = Array.isArray(pet.healthHistory) ? pet.healthHistory : [];

  // Próxima cita de esta mascota (o sin mascota indicada) que siga en pie.
  const proximaCita = (citasQ.data?.items || [])
    .filter(c => ['requested', 'confirmed', 'rescheduled'].includes(c.status))
    .filter(c => !c.animalCode || c.animalCode === pet.code || String(c.animalId?._id || c.animalId || '') === String(pet._id))
    .map(c => ({ c, t: new Date(c.scheduledAt || c.requestedAt).getTime() }))
    .filter(x => x.t >= ahora - 3_600_000)
    .sort((a, b) => a.t - b.t)[0]?.c;

  // Vacunas: pendiente = su última dosis vence en menos de 30 días (o ya venció).
  const vacunas = ultimasPorCosa(salud, 'vaccine');
  const vacunasPendientes = vacunas
    .filter(v => v.nextDueAt && new Date(v.nextDueAt).getTime() <= ahora + 30 * DIA)
    .sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime());
  // Cada desparasitación (interna, pipeta…) por separado: una pipeta reciente no
  // tapa una interna vencida (AUD-2).
  const desparas = ultimasPorCosa(salud, 'deworming').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const ultimaDesparas = desparas[0];
  const desparasVencidas = desparas.filter(d => d.nextDueAt && new Date(d.nextDueAt).getTime() < ahora);
  const desparasVencida = desparasVencidas.length > 0;
  // Sin próxima fecha (aviso quitado) no se puede decir que esté al día (AUD-3).
  const desparasSinFecha = !!ultimaDesparas && !ultimaDesparas.nextDueAt;
  // Vacunas con aviso quitado: no se puede decir que estén «al día».
  const vacunasSinFecha = vacunas.filter(v => !v.nextDueAt);
  const medicacion = ultimasPorCosa(salud, 'medication');
  // En tratamiento: con pauta y sin haber pasado su último día. Las antiguas, sin
  // pauta, solo son historial. Sin fecha de fin sigue hasta que se le ponga una.
  const hoyInicio = new Date(ahora).setHours(0, 0, 0, 0);
  const tratamientos = salud
    .filter(e => e.type === 'medication' && e.frequency && (!e.endsAt || new Date(e.endsAt).getTime() >= hoyInicio))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const vencidas = [
    ...vacunas.filter(v => v.nextDueAt && new Date(v.nextDueAt).getTime() < ahora),
    ...desparasVencidas,
    ...medicacion.filter(m => m.nextDueAt && new Date(m.nextDueAt).getTime() < ahora),
  ];
  const sinNada = !salud.length;

  // Historial: lo apuntado y las visitas al veterinario, lo más reciente primero.
  const historial = [
    ...salud.map(e => ({ ...e, _tipo: 'salud' })),
    ...(pet.vetHistory || []).map((v: any) => ({ date: v.date, type: 'visit', notes: v.note, _tipo: 'visita' })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Consejos según su estado de verdad; si todo está bien, los generales.
  const consejos: Array<{ titulo: string; texto: string; accion?: () => void }> = [];
  if (vacunasPendientes[0]) {
    const v = vacunasPendientes[0];
    const vencida = new Date(v.nextDueAt).getTime() < ahora;
    consejos.push({ titulo: `${vencida ? 'Le toca ya' : 'Pronto le toca'} la vacuna${v.notes ? `: ${nombreCorto(v.notes)}` : ''}`, texto: `${vencida ? 'Venció' : 'Vence'} el ${fechaCorta(v.nextDueAt)}. Pide cita con tiempo.`, accion: () => nav('/citas') });
  } else if (!vacunas.length) {
    consejos.push({ titulo: 'Mantén sus vacunas al día', texto: 'Le protegen de enfermedades importantes. Apunta la última y te avisamos de la siguiente.', accion: () => setApuntar({ tipo: 'vaccine' }) });
  }
  if (!ultimaDesparas || desparasVencida) {
    consejos.push({ titulo: 'Desparasítalo cada 3 meses', texto: 'Le protege de pulgas, garrapatas y parásitos internos.', accion: () => setApuntar({ tipo: 'deworming' }) });
  }
  if (!pet.weightKg) consejos.push({ titulo: 'Apunta su peso', texto: 'Así verás si engorda o adelgaza entre visitas.', accion: () => setEditarDatos(true) });
  if (consejos.length < 3) consejos.push({ titulo: 'Una revisión al año', texto: 'Aunque esté bien, el veterinario detecta a tiempo lo que no se ve.', accion: () => nav('/citas') });
  const tip = consejos[consejo % consejos.length];

  const condicion = CONDICIONES.find(c => c.valor === pet.bodyCondition)?.texto;

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560, margin: '0 auto', padding: '4px 0 12px', fontFamily: M.letra, color: '#14231F' }}>
      {mascotas.length > 1 && <PetSwitcher pets={mascotas} selectedId={String(pet._id)} onSelect={setElegida} />}
      <header>
        <h1 style={{ margin: 0, fontFamily: M.titulos, fontSize: 32, lineHeight: '36px', fontWeight: 800 }}>Cuidados</h1>
        <p style={{ margin: '4px 0 12px', fontSize: 15.5, color: '#3D4340' }}>
          La salud y el bienestar de {mascotas.length > 1 ? pet.name : 'tu mascota'}, en un solo lugar.
        </p>
        <Link to="/citas" style={{ display: 'inline-flex', alignItems: 'center', gap: 14, height: 56, padding: '0 20px', borderRadius: 18, background: '#C24B1C', boxShadow: '0 3px 0 #9E3A12', color: '#FFF5E6', fontSize: 17.5, fontWeight: 800, textDecoration: 'none' }}>
          <CalcoCuiPedir size={26} color="#FFF5E6" />
          Pedir cita veterinaria
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFF5E6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
        </Link>
      </header>

      <Fila icono={<CalcoCuiCita size={28} />} fondo="#E6F2EE" titulo="Próxima cita" to={citasQ.isError ? undefined : '/citas'}
        subtitulo={proximaCita ? (proximaCita.service?.name || proximaCita.reason) : citasQ.isLoading ? 'Cargando…' : citasQ.isError ? 'No hemos podido cargar tus citas' : 'Sin citas pedidas'}>
        {citasQ.isError && (
          <button type="button" onClick={() => citasQ.refetch()} style={{ ...REINTENTAR, marginTop: 6, fontSize: 14.5 }}>Reintentar</button>
        )}
        {proximaCita && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 15.5, color: '#14231F' }}>
            <CalcoCuiCitaPequena size={17} /> {fechaCita(proximaCita.scheduledAt || proximaCita.requestedAt)}
            {proximaCita.status === 'requested' && <span style={{ fontSize: 13, color: GRIS }}>· sin confirmar</span>}
          </span>
        )}
      </Fila>

      <Fila icono={<CalcoCuiVacunas size={30} />} fondo="#FDF1DC" titulo="Vacunas"
        subtitulo={vacunasPendientes.length ? `${vacunasPendientes.length} ${vacunasPendientes.length === 1 ? 'pendiente' : 'pendientes'}` : vacunas.length === vacunasSinFecha.length && vacunas.length ? 'Sin próxima fecha' : vacunasSinFecha.length ? `${vacunasSinFecha.length} sin próxima fecha` : vacunas.length ? 'Al día' : 'Sin vacunas apuntadas'}>
        {vacunasPendientes[0] && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '7px 10px', borderRadius: 10, background: '#FCEBDD', fontSize: 14, color: '#3D2A1E' }}>
            <CalcoCuiAlerta size={17} />
            <span><strong>{nombreCorto(vacunasPendientes[0].notes) || 'Vacuna'}</strong> · {new Date(vacunasPendientes[0].nextDueAt).getTime() < ahora ? 'Venció' : 'Vence'} el {fechaCorta(vacunasPendientes[0].nextDueAt)}</span>
          </span>
        )}
        {!vacunasPendientes.length && vacunasSinFecha[0] && (
          <span style={{ display: 'block', marginTop: 6, fontSize: 14.5, color: '#3D4340' }}>
            {vacunasSinFecha.length === 1 ? `${nombreCorto(vacunasSinFecha[0].notes) || 'Vacuna'}: sin próxima fecha · última el ${fechaCorta(vacunasSinFecha[0].date)}` : `${vacunasSinFecha.length} vacunas sin próxima fecha`}
          </span>
        )}
      </Fila>

      <Fila icono={<CalcoCuiDesparasitacion size={30} />} fondo="#E6F2EE" titulo="Desparasitación"
        subtitulo={!ultimaDesparas ? 'Sin apuntar' : desparasVencida ? 'Pendiente' : desparasSinFecha ? 'Sin próxima fecha' : 'Al día'}>
        {ultimaDesparas && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 15, color: '#3D4340' }}>
            {desparasVencida ? <CalcoCuiAlerta size={17} /> : <Visto />} {desparasVencida ? `${nombreCorto(desparasVencidas[0].notes) || 'Pendiente'}: venció el ${fechaCorta(desparasVencidas[0].nextDueAt)}` : `Última: ${fechaCorta(ultimaDesparas.date)}${desparasSinFecha ? ' · sin próxima fecha' : ''}`}
          </span>
        )}
      </Fila>

      {tratamientos.length > 0 && (
        <Fila icono={<CalcoCuiBtnMedicacion size={30} />} fondo="#FDF1DC" titulo="Medicación"
          subtitulo={`${tratamientos.length} en tratamiento`}>
          {tratamientos.map(t => {
            const toma = estadoToma(t, new Date(ahora));
            return (
              <span key={t._id} style={{ display: 'block', marginTop: 6 }}>
                <button type="button" onClick={() => setApuntar({ entrada: t })}
                  style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'none', textAlign: 'left', font: 'inherit', fontSize: 14.5, lineHeight: '20px', color: '#3D4340', cursor: 'pointer' }}>
                  <strong>{nombreCorto(t.notes)}</strong> · {medicationSummary(t)}
                </button>
                {toma && (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6, fontSize: 14, color: '#3D2A1E' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{toma.pendiente && <CalcoCuiAlerta size={17} />}{toma.texto}</span>
                    {toma.marcar && (
                      <button type="button" disabled={marcarToma.isPending} onClick={() => marcarToma.mutate({ code: String(pet.code), id: String(t._id) })}
                        style={{ flexShrink: 0, height: 40, padding: '0 16px', borderRadius: 12, border: 0, background: '#0E5F5B', color: '#fff', font: 'inherit', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                        Dada
                      </button>
                    )}
                  </span>
                )}
              </span>
            );
          })}
        </Fila>
      )}

      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, background: vencidas.length ? '#B4472A' : '#14726E', color: '#fff', padding: '18px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span aria-hidden style={{ position: 'absolute', right: -10, bottom: -24, width: 110, height: 110, borderRadius: 999, background: 'rgba(255,255,255,.08)' }} />
        <span style={{ width: 62, height: 62, borderRadius: 999, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <CalcoCuiSalud size={32} color="#FFFFFF" />
        </span>
        <span style={{ position: 'relative' }}>
          <span style={{ display: 'block', fontFamily: M.titulos, fontSize: 20, fontWeight: 800 }}>Salud general</span>
          <span style={{ display: 'block', fontSize: 15.5, marginTop: 2 }}>
            {sinNada ? 'Empieza apuntando sus vacunas' : vencidas.length ? `${vencidas.length} ${vencidas.length === 1 ? 'cosa pendiente' : 'cosas pendientes'}` : vacunasSinFecha.length || desparasSinFecha ? 'Revisa lo que no tiene próxima fecha' : 'Todo en orden'}
          </span>
        </span>
      </div>

      <div style={{ ...TARJETA, padding: '16px 14px 14px' }}>
        <h2 style={{ ...TITULO, display: 'flex', alignItems: 'center', gap: 10, marginLeft: 2 }}><CalcoCuiRegistra size={22} /> Registra un cuidado</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginTop: 12 }}>
          {([
            ['vaccine', 'Vacuna', <CalcoCuiBtnVacuna key="v" size={26} />],
            ['deworming', 'Desparasitar', <CalcoCuiBtnDesparasitacion key="d" size={24} />],
            ['medication', 'Medicación', <CalcoCuiBtnMedicacion key="m" size={24} />],
            ['other', 'Otro', <span key="o" style={{ fontSize: 26, lineHeight: '24px', fontWeight: 900, color: '#1C665E', letterSpacing: 1 }}>···</span>],
          ] as Array<[HealthCategory, string, React.ReactNode]>).map(([tipo, texto, icono]) => (
            <button key={tipo} type="button" onClick={() => setApuntar({ tipo })}
              style={{ display: 'grid', justifyItems: 'center', gap: 6, padding: '12px 0 10px', borderRadius: 16, border: '1px solid #EEE6D8', background: '#F7F1E7', cursor: 'pointer', font: 'inherit', fontSize: 12, letterSpacing: -0.2, fontWeight: 600, color: '#14231F', minWidth: 0 }}>
              <span style={{ height: 28, display: 'flex', alignItems: 'center' }}>{icono}</span>
              <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...TARJETA, padding: '16px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h2 style={{ ...TITULO, display: 'flex', alignItems: 'center', gap: 10 }}><CalcoCuiHistorial size={24} /> Historial {verTodo ? '' : 'reciente'}</h2>
          {historial.length > 3 && (
            <button type="button" onClick={() => setVerTodo(v => !v)} style={{ border: 0, background: 'none', padding: 0, color: '#0E5F5B', font: 'inherit', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
              {verTodo ? 'Ver menos' : 'Ver todo ›'}
            </button>
          )}
        </div>
        {historial.length === 0 ? (
          <p style={{ margin: '10px 0 10px', fontSize: 15, color: GRIS }}>Aún no hay nada apuntado. Empieza por sus vacunas.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
            {(verTodo ? historial : historial.slice(0, 3)).map((e, i, todas) => {
              const editable = e._tipo === 'salud' && e._id;
              return (
                <li key={e._id || `${e.type}-${i}`} role={editable ? 'button' : undefined} tabIndex={editable ? 0 : undefined}
                  onClick={editable ? () => setApuntar({ entrada: e }) : undefined}
                  onKeyDown={editable ? (ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setApuntar({ entrada: e }); } }) : undefined}
                  style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) 28px', columnGap: 12, alignItems: 'center', paddingBottom: 12, cursor: editable ? 'pointer' : 'default' }}>
                  <span aria-hidden style={{ position: 'relative', alignSelf: 'stretch' }}>
                    <span style={{ position: 'absolute', left: 3, top: 7, width: 12, height: 12, borderRadius: 999, background: '#0E6E62' }} />
                    {i < todas.length - 1 && <span style={{ position: 'absolute', left: 8, top: 21, bottom: -14, width: 2, background: '#CFE0D8' }} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 15.5, lineHeight: '21px' }}>
                      <strong>{e.type === 'visit' ? 'Revisión veterinaria' : healthCategoryLabel(e.type)}</strong>{e.notes ? <span style={{ color: '#3D4340' }}> · {e.notes}</span> : null}{e.type === 'medication' && medicationSummary(e) ? <span style={{ color: '#3D4340' }}> · {medicationSummary(e)}</span> : null}
                    </span>
                    <span style={{ display: 'block', fontSize: 13.5, color: GRIS }}>{fechaCorta(e.date)}</span>
                  </span>
                  <Visto />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div style={{ ...TARJETA, padding: '16px 16px 14px' }}>
        <h2 style={{ ...TITULO, display: 'flex', alignItems: 'center', gap: 10 }}><CalcoCuiConsejos size={24} /> Consejos para su bienestar</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '108px minmax(0, 1fr) 40px', alignItems: 'center', gap: 10, marginTop: 12, padding: '6px 10px 6px 4px', borderRadius: 18, background: 'linear-gradient(90deg, #F3F7F1, #E7F1EC)' }}>
          <img src="/ilustraciones/cuidados-consejo.png" alt="" aria-hidden style={{ width: 108, height: 'auto' }} />
          <button type="button" onClick={tip.accion} disabled={!tip.accion} style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', font: 'inherit', cursor: tip.accion ? 'pointer' : 'default', color: '#14231F' }}>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 800, lineHeight: '21px' }}>{tip.titulo}</span>
            <span style={{ display: 'block', fontSize: 14, lineHeight: '19px', color: '#4A524D', marginTop: 3 }}>{tip.texto}</span>
          </button>
          <button type="button" aria-label="Siguiente consejo" onClick={() => setConsejo(n => n + 1)}
            style={{ width: 40, height: 40, borderRadius: 999, border: '1px solid #E4DED3', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14231F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10 }}>
          {consejos.map((_, i) => (
            <button key={i} type="button" aria-label={`Consejo ${i + 1}`} onClick={() => setConsejo(i)}
              style={{ width: 9, height: 9, padding: 0, borderRadius: 999, border: 0, background: i === consejo % consejos.length ? '#0E6E62' : '#D9D6CF', cursor: 'pointer' }} />
          ))}
        </div>
      </div>

      <div style={{ ...TARJETA, padding: '16px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ ...TITULO, display: 'flex', alignItems: 'center', gap: 10 }}><CalcoCuiDatos size={24} /> Sus datos de salud</h2>
          <button type="button" onClick={() => setEditarDatos(true)} style={{ border: 0, background: 'none', padding: 0, color: '#0E5F5B', font: 'inherit', fontSize: 15.5, fontWeight: 800, cursor: 'pointer' }}>Editar ›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 14, marginTop: 12, alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CalcoCuiPeso size={28} />
            <span>
              <span style={{ display: 'block', fontSize: 14, color: GRIS }}>Peso</span>
              <span style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>{pet.weightKg ? `${String(pet.weightKg).replace('.', ',')} kg` : '—'}</span>
              {pet.weightAt && <span style={{ display: 'block', fontSize: 12.5, color: GRIS }}>{haceCuanto(pet.weightAt)}</span>}
            </span>
          </span>
          <span aria-hidden style={{ alignSelf: 'stretch', background: '#E6E1D8' }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CalcoCuiCondicion size={26} />
            <span>
              <span style={{ display: 'block', fontSize: 14, color: GRIS }}>Condición</span>
              <span style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>{condicion || '—'}</span>
            </span>
          </span>
        </div>
      </div>

      {apuntar && pet.code && (
        <HealthEntrySheet code={String(pet.code)} entry={apuntar.entrada || null} tipoInicial={apuntar.tipo} petName={pet.name}
          onClose={() => setApuntar(null)} onChanged={refrescar} />
      )}
      {editarDatos && <DatosSheet pet={pet} onClose={() => setEditarDatos(false)} onSaved={refrescar} />}
    </div>
  );
}

function DatosSheet({ pet, onClose, onSaved }: { pet: any; onClose: () => void; onSaved: () => void }) {
  const [peso, setPeso] = React.useState(pet.weightKg ? String(pet.weightKg).replace('.', ',') : '');
  const [cond, setCond] = React.useState<BodyCondition | null>(pet.bodyCondition || null);
  const guardar = useMutation({
    mutationFn: () => {
      // El peso solo si ha cambiado: si no, el servidor lo fecharía hoy (AUD-2).
      const n = peso.trim() ? Number(peso.replace(',', '.')) : null;
      const cambios: Parameters<typeof updateMyPet>[1] = { bodyCondition: cond };
      if (n !== (pet.weightKg ?? null)) cambios.weightKg = n;
      return updateMyPet(String(pet._id), cambios);
    },
    onSuccess: () => { toast.success('Datos guardados'); onSaved(); onClose(); },
    onError: () => toast.error('Revisa el peso: tiene que ser un número entre 0 y 200 kg.'),
  });
  const dialogo = useDialog<HTMLDivElement>(onClose);
  const pesoValido = !peso.trim() || (Number(peso.replace(',', '.')) > 0 && Number(peso.replace(',', '.')) <= 200);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Sus datos de salud" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20,30,25,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div ref={dialogo} tabIndex={-1} onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, boxSizing: 'border-box', background: '#FFFDFA', borderRadius: '24px 24px 0 0', padding: '14px 18px calc(18px + env(safe-area-inset-bottom))', fontFamily: M.letra, color: M.tinta, display: 'grid', gap: 14 }}>
        <span aria-hidden style={{ width: 44, height: 5, borderRadius: 99, background: '#D9D6CF', margin: '0 auto' }} />
        <h2 style={{ margin: 0, fontFamily: M.titulos, fontSize: 20, fontWeight: 800 }}>Datos de salud de {pet.name}</h2>
        <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#3D4340' }}>
          Peso (kg)
          <input inputMode="decimal" value={peso} onChange={e => setPeso(e.target.value)} placeholder="24,5"
            style={{ height: 48, borderRadius: 12, border: '1px solid #E4DED3', padding: '0 14px', font: 'inherit', fontSize: 17 }} />
        </label>
        <div style={{ display: 'grid', gap: 8 }}>
          <span style={{ fontSize: 14, color: '#3D4340' }}>Condición corporal</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CONDICIONES.map(c => {
              const activa = cond === c.valor;
              return (
                <button key={c.valor} type="button" onClick={() => setCond(activa ? null : c.valor)} aria-pressed={activa}
                  style={{ height: 42, padding: '0 14px', borderRadius: 999, border: activa ? '1.5px solid #0E5F5B' : '1px solid #E2DED5', background: activa ? '#E4F2DE' : '#fff', font: 'inherit', fontSize: 15, fontWeight: activa ? 800 : 500, color: '#14231F', cursor: 'pointer' }}>
                  {c.texto}
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 13, color: GRIS }}>Si dudas, al tocarle las costillas deberían notarse sin verse.</span>
        </div>
        <button type="button" disabled={guardar.isPending || !pesoValido} onClick={() => guardar.mutate()}
          style={{ height: 52, borderRadius: 14, border: 0, background: M.verdeBoton, color: '#fff', font: 'inherit', fontSize: 16.5, fontWeight: 800, opacity: guardar.isPending || !pesoValido ? 0.6 : 1 }}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onClose} style={{ height: 40, border: 0, background: 'none', color: GRIS, font: 'inherit', fontSize: 15 }}>Cancelar</button>
      </div>
    </div>,
    document.body,
  );
}
