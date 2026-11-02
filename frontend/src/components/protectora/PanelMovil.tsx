import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchAnimals } from '../../api/animals';
import { listMyVetAppointments, type VetAppointment } from '../../api/vetAppointments';
import { toAbsoluteUrl } from '../../utils/media';
import { shareLink } from '../../utils/native';
import { M } from '../pet/maqueta';
import {
  CalcoPanelAccionAdopciones, CalcoPanelAccionCita, CalcoPanelAccionHuella, CalcoPanelCalendario, CalcoPanelCorazon,
  CalcoPanelEnlace, CalcoPanelFlechaFila, CalcoPanelFlechaVer, CalcoPanelHuellas, CalcoPanelMas, CalcoPanelPatitasBlanca,
  CalcoPanelPatitasNaranja, CalcoPanelRegalo, CalcoPanelStatCita, CalcoPanelStatCorazon, CalcoPanelStatHuella,
  CalcoPanelStatMonedas, CalcoPanelUbicacion,
} from '../icons/calcados';

/**
 * Panel de la protectora en el móvil, con las medidas de la maqueta «Amigo Fiel» (2 nov 2026,
 * iPhone de 390). En el ordenador sigue el tablero de ProtectoraDashboard.
 * 1 Patita = 0,10 € (el mismo valor que usa la reserva de citas).
 */
type Props = {
  shelterId: string;
  orgName: string;
  publicados?: number;
  solicitudesAbiertas: number;
  patitas?: number;
  adopciones: any[];
  cannotPublishYet: boolean;
};

const TARJETA: React.CSSProperties = { background: '#FFFFFF', borderRadius: 18, boxShadow: M.sombra, border: '1px solid #F1EBE2' };
const num = (n?: number) => (typeof n === 'number' ? n.toLocaleString('es-ES') : '—');

function hace(fecha?: string) {
  if (!fecha) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60000));
  if (min < 60) return `Hace ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'Ayer' : `Hace ${d} días`;
}

function Cabecera({ icono, titulo, ver, a }: { icono: React.ReactNode; titulo: string; ver: string; a: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px' }}>
      {icono}
      <h2 style={{ flex: 1, margin: 0, fontFamily: M.titulos, fontSize: 16.5, fontWeight: 700, color: '#17352D' }}>{titulo}</h2>
      <Link to={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: '#07756A', textDecoration: 'none' }}>
        {ver} <CalcoPanelFlechaVer size={10} />
      </Link>
    </div>
  );
}

export default function PanelMovil({ shelterId, orgName, publicados, solicitudesAbiertas, patitas, adopciones, cannotPublishYet }: Props) {
  const animalesQ = useQuery({
    queryKey: ['panel-movil-animales', shelterId],
    queryFn: () => searchAnimals({ shelter: shelterId, limit: 4, page: 1, sort: 'createdAt', dir: 'desc' }),
    enabled: Boolean(shelterId),
  });
  const citasQ = useQuery({ queryKey: ['vet-appointments', 'panel-movil'], queryFn: () => listMyVetAppointments() });

  const ahora = Date.now();
  const citas: VetAppointment[] = ((citasQ.data as any)?.items || (Array.isArray(citasQ.data) ? citasQ.data : []) || [])
    .filter((c: VetAppointment) => ['requested', 'confirmed', 'rescheduled'].includes(c.status))
    .filter((c: VetAppointment) => new Date(c.scheduledAt || c.requestedAt).getTime() >= ahora - 3600000)
    .sort((x: VetAppointment, y: VetAppointment) => new Date(x.scheduledAt || x.requestedAt).getTime() - new Date(y.scheduledAt || y.requestedAt).getTime());
  const cita = citas[0];
  const ultima = [...adopciones].sort((x: any, y: any) => new Date(y.createdAt || 0).getTime() - new Date(x.createdAt || 0).getTime())[0];
  const animales: any[] = animalesQ.data?.items || [];
  const totalAnimales = animalesQ.data?.total;

  const promocionar = () => {
    void shareLink({ title: `${orgName} en MyPetLive`, text: `Conoce a los animales de ${orgName} y ayúdales con Patitas.`, path: `/animals?shelter=${encodeURIComponent(shelterId)}` }).catch(() => undefined);
  };

  const accion = (to: string, tinte: string, icono: React.ReactNode, texto: React.ReactNode) => (
    <Link to={to} style={{ ...TARJETA, borderRadius: 14, height: 60, display: 'grid', gridTemplateColumns: '36px 1fr', alignItems: 'center', columnGap: 6, padding: '0 6px 0 9px', textDecoration: 'none' }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: tinte, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{icono}</span>
      <span style={{ fontSize: 12.5, lineHeight: '15px', fontWeight: 700, color: '#1F2B27', textAlign: 'center' }}>{texto}</span>
    </Link>
  );

  const dato = (tinte: string, icono: React.ReactNode, valor: string, texto: React.ReactNode, primera?: boolean) => (
    <div style={{ position: 'relative', display: 'grid', justifyItems: 'center', alignContent: 'start', gap: 3, padding: '9px 2px 0' }}>
      {!primera && <span aria-hidden style={{ position: 'absolute', left: 0, top: 14, bottom: 6, width: 1, background: '#ECE6DC' }} />}
      <span style={{ width: 36, height: 36, borderRadius: 999, background: tinte, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{icono}</span>
      <span style={{ fontFamily: M.titulos, fontSize: 22, lineHeight: '26px', fontWeight: 800, color: '#14231F', marginTop: 3 }}>{valor}</span>
      <span style={{ fontSize: 11.5, lineHeight: '14px', color: '#4F5551', textAlign: 'center' }}>{texto}</span>
    </div>
  );

  const fechaCita = cita ? new Date(cita.scheduledAt || cita.requestedAt) : null;
  const dia = (f: Date, o: Intl.DateTimeFormatOptions) => f.toLocaleDateString('es-ES', o).replace('.', '').toUpperCase();

  return (
    <div style={{ fontFamily: M.letra, letterSpacing: 0, color: M.tinta, display: 'grid', gap: 12, margin: '-24px 0 0', paddingTop: 6 }}>
      {/* Cabecera: nombre de la protectora y el perro con el gato a la derecha. */}
      <header style={{ position: 'relative', minHeight: 100, padding: '6px 0 0 10px' }}>
        <img src="/ilustraciones/panel-cabecera.png" alt="" aria-hidden style={{ position: 'absolute', right: -12, top: 0, width: 166, height: 'auto' }} />
        <div style={{ position: 'relative', maxWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', color: '#6F8A70' }}>PROTECTORA</div>
          <h1 style={{ margin: '3px 0 0', fontFamily: M.titulos, fontSize: 27, lineHeight: '31px', fontWeight: 800, color: '#17352D' }}>{orgName}</h1>
          <p style={{ margin: '5px 0 0', fontSize: 14.5, lineHeight: '19px', color: '#4F5551' }}>Gestiona tus animales, adopciones, citas y donaciones en un solo lugar.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 11, padding: '0 2px', marginTop: 4 }}>
        {cannotPublishYet
          ? accion('/landlord/verificacion', '#E3F1EE', <CalcoPanelAccionHuella size={17} />, <>Verificar<br />protectora</>)
          : accion('/landlord/animals', '#E3F1EE', <CalcoPanelAccionHuella size={17} />, <>Publicar<br />animal</>)}
        {accion('/landlord/adoptions', '#FDEBE2', <CalcoPanelAccionAdopciones size={20} />, <>Gestionar<br />adopciones</>)}
        {accion('/citas', '#E3F1EE', <CalcoPanelAccionCita size={20} />, <>Pedir cita<br />veterinaria</>)}
      </div>

      <section style={{ ...TARJETA, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', minHeight: 118, padding: '0 4px 10px' }}>
        {dato('#E3F1E7', <CalcoPanelStatHuella size={16} />, num(publicados), <>Animales<br />publicados</>, true)}
        {dato('#FDE7DD', <CalcoPanelStatCorazon size={17} />, num(solicitudesAbiertas), <>Solicitudes<br />en revisión</>)}
        {dato('#DDF1EC', <CalcoPanelStatCita size={18} />, num(citas.length), <>Citas<br />programadas</>)}
        {dato('#FEF0D4', <CalcoPanelStatMonedas size={18} />, num(patitas), <>Patitas<br />recibidas</>)}
      </section>

      <section style={{ ...TARJETA, padding: '9px 10px 10px 13px', display: 'grid', gap: 9 }}>
        <Cabecera icono={<CalcoPanelCorazon size={19} />} titulo="Solicitudes de adopción" ver="Ver todas" a="/landlord/adoptions" />
        {ultima ? (
          <Link to={`/adoptions/${ultima.id || ultima._id}`} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 10px', alignItems: 'center', columnGap: 13, padding: '4px 12px 4px 6px', minHeight: 54, borderRadius: 10, background: '#F7F3EE', textDecoration: 'none', color: M.tinta }}>
            {ultima.animal?.images?.[0] ? (
              <img src={toAbsoluteUrl(ultima.animal.images[0])} alt="" style={{ width: 50, height: 44, borderRadius: 9, objectFit: 'cover' }} />
            ) : <span style={{ width: 50, height: 44, borderRadius: 9, background: '#E6E0D2' }} />}
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: '#1F2B27' }}>{ultima.animal?.name || 'Animal'}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: '#5E6460' }}>{ultima.status === 'pending' || ultima.status === 'recibida' ? 'Nueva solicitud' : 'Solicitud'} · {hace(ultima.createdAt)}</span>
            </span>
            <CalcoPanelFlechaFila size={9} />
          </Link>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: '#5E6460', padding: '4px 4px 2px' }}>Aún no hay solicitudes. Te avisaremos en cuanto llegue una.</p>
        )}
      </section>

      <section style={{ ...TARJETA, padding: '9px 10px 10px 13px', display: 'grid', gap: 9 }}>
        <Cabecera icono={<CalcoPanelCalendario size={20} />} titulo="Próximas citas" ver="Ver agenda" a="/citas" />
        {cita && fechaCita ? (
          <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', columnGap: 12 }}>
            <div style={{ height: 58, borderRadius: 10, background: '#E6F1EE', display: 'grid', placeItems: 'center', alignContent: 'center', color: '#0B6A5F', lineHeight: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{dia(fechaCita, { weekday: 'short' })}</span>
              <span style={{ fontFamily: M.titulos, fontSize: 19, fontWeight: 800, color: '#14231F', margin: '2px 0' }}>{fechaCita.getDate()}</span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{dia(fechaCita, { month: 'short' })}</span>
            </div>
            <Link to="/citas" style={{ display: 'grid', gridTemplateColumns: '1fr 10px', alignItems: 'center', columnGap: 8, padding: '0 12px 0 11px', minHeight: 58, borderRadius: 10, border: '1px solid #ECE6DC', textDecoration: 'none', color: M.tinta }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1F2B27', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cita.service?.name || cita.reason || 'Cita veterinaria'}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#5E6460', marginTop: 3 }}>
                  <CalcoPanelUbicacion size={13} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cita.vetId?.profile?.orgName || cita.vetId?.name || 'Veterinario'} · {fechaCita.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
              </span>
              <CalcoPanelFlechaFila size={9} />
            </Link>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: '#5E6460', padding: '4px 4px 2px' }}>No tienes citas próximas.</p>
        )}
      </section>

      {/* Tus Patitas: tarjeta verde con las monedas y debajo dos botones. */}
      <section style={{ ...TARJETA, padding: 0, overflow: 'hidden' }}>
        <div style={{ position: 'relative', background: '#0B6E66', minHeight: 98, borderRadius: 18, color: '#FFFFFF', padding: '11px 0 0 18px', overflow: 'hidden' }}>
          <img src="/ilustraciones/panel-monedas.png" alt="" aria-hidden style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 'auto', WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 30%)', maskImage: 'linear-gradient(to right, transparent 0, #000 30%)' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 700 }}>
            <CalcoPanelPatitasBlanca size={18} /> Tus Patitas
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 9, marginTop: 2 }}>
            <CalcoPanelPatitasNaranja size={21} />
            <span style={{ fontFamily: M.titulos, fontSize: 27, lineHeight: '31px', fontWeight: 800 }}>{num(patitas)}</span>
          </div>
          <div style={{ position: 'relative', fontSize: 13, marginTop: 1 }}>
            ≈ {((patitas || 0) * 0.1).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € para la protectora
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '158fr 175fr', gap: 11, padding: '9px 10px 10px 12px' }}>
          <button type="button" onClick={() => window.dispatchEvent(new Event('mpl:abrir-qr'))} style={{ height: 36, border: 0, borderRadius: 10, background: '#E5F1EC', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: M.letra, fontSize: 12.5, fontWeight: 700, color: '#1F2B27', cursor: 'pointer', whiteSpace: 'nowrap', padding: '0 6px' }}>
            <CalcoPanelRegalo size={15} /> Compartir mi QR
          </button>
          <button type="button" onClick={promocionar} style={{ height: 36, border: 0, borderRadius: 10, background: '#FDF0DC', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: M.letra, fontSize: 12.5, fontWeight: 700, color: '#1F2B27', cursor: 'pointer', whiteSpace: 'nowrap', padding: '0 6px' }}>
            <CalcoPanelEnlace size={14} /> Promocionar protectora
          </button>
        </div>
      </section>

      <section style={{ ...TARJETA, padding: '9px 10px 11px 13px', display: 'grid', gap: 10 }}>
        <Cabecera icono={<CalcoPanelHuellas size={20} />} titulo="Mis animales" ver="Ver todos" a="/landlord/animals" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 11 }}>
          {animales.slice(0, 4).map((a: any) => (
            <Link key={a._id || a.id} to={`/landlord/animals/${a._id || a.id}`} style={{ aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden', background: '#EFE9DF', display: 'block' }}>
              {a.images?.[0] && <img src={toAbsoluteUrl(a.images[0])} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </Link>
          ))}
          <Link to="/landlord/animals" style={{ gridColumn: 5, aspectRatio: '1 / 1', borderRadius: 10, background: '#E9F2EE', display: 'grid', placeItems: 'center', alignContent: 'center', gap: 2, textDecoration: 'none', color: '#1F2B27', textAlign: 'center', fontSize: 11, lineHeight: '13px' }}>
            <CalcoPanelMas size={12} />
            <span>Ver todos{typeof totalAnimales === 'number' ? <><br />({totalAnimales})</> : null}</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
