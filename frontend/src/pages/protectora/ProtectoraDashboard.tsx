import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, HeartHandshake, Inbox, Plus, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { searchAnimals } from '../../api/animals';
import { ADOPTION_STATUS_LABEL, listAllAdoptionsForMyAnimals } from '../../api/adoptions';
import { getPatitasBalance } from '../../api/patitas';
import { getShelterMetrics, downloadShelterMetricsCsv } from '../../api/metrics';
import { getMyVerification } from '../../api/verification';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, MPL_FONT_MONO, PawMark } from '../../styles/mypetlive';

const OPEN_ADOPTION_STATES = ['recibida', 'cuestionario_pendiente', 'en_revision', 'info_adicional', 'cita_propuesta', 'preaprobada'];

// El tablero debe cubrir todos los estados vivos: `info_adicional` no tenía columna,
// así que las solicitudes en las que la protectora había pedido datos al adoptante
// desaparecían del panel aunque el contador de "en proceso" sí las sumaba.
// `cuestionario_pendiente` hoy no lo fija nadie, pero existe en el modelo: lo
// agrupamos con "Recibidas" en lugar de dejarlo sin columna.
const KANBAN: Array<{ key: string; title: string; color: string; statuses: string[] }> = [
  { key: 'recibida', title: 'Recibidas', color: MPL.goldDark, statuses: ['recibida', 'cuestionario_pendiente'] },
  { key: 'en_revision', title: 'En revisión', color: MPL.goldDark, statuses: ['en_revision'] },
  { key: 'info_adicional', title: 'Info pendiente', color: MPL.coralDark, statuses: ['info_adicional'] },
  { key: 'cita_propuesta', title: 'Cita propuesta', color: MPL.coralDark, statuses: ['cita_propuesta'] },
  { key: 'preaprobada', title: 'Preaprobada', color: MPL.tealDark, statuses: ['preaprobada'] },
  { key: 'aprobada', title: 'Aprobada', color: MPL.oliveDark, statuses: ['aprobada'] },
];

const eur = (value: number) => `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const days = (value: number) => value.toLocaleString('es-ES', { maximumFractionDigits: 1 });

function StatCard({
  icon,
  value,
  label,
  note,
  tone = MPL.teal,
  dark = false,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  note?: string;
  tone?: string;
  dark?: boolean;
}) {
  return (
    <div style={{ background: dark ? MPL.teal : '#fff', border: dark ? 'none' : `1px solid ${MPL.border}`, borderRadius: 20, padding: 22, color: dark ? '#fff' : MPL.ink }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: dark ? 'rgba(255,255,255,.18)' : `${tone}18`, color: dark ? '#fff' : tone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </span>
        {note && <span style={{ fontSize: 12, color: dark ? '#F6D78A' : MPL.oliveDark, fontWeight: 800 }}>{note}</span>}
      </div>
      <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13.5, color: dark ? 'rgba(255,255,255,.82)' : MPL.muted, marginTop: 5 }}>{label}</div>
    </div>
  );
}

// Un fallo de red no puede pintarse como "no tienes nada": se dice y se ofrece reintentar.
function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 20, display: 'grid', gap: 10, justifyItems: 'start' }}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      <div style={{ color: MPL.muted, fontSize: 14 }}>Puede ser un problema de conexión. Vuelve a intentarlo en un momento.</div>
      <button
        type="button"
        onClick={onRetry}
        style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '8px 16px', fontSize: 13.5, fontWeight: 800, color: MPL.tealDark, cursor: 'pointer' }}
      >
        Reintentar
      </button>
    </div>
  );
}

export default function ProtectoraDashboard() {
  const { user } = useAuth();
  const shelterId = String(user?._id || '');
  const [exporting, setExporting] = useState(false);

  // Solo necesitamos contar, no listar: pedimos `limit: 1` y usamos el `total` del
  // servidor. Antes se traían 100 fichas y se contaban en cliente, así que una
  // protectora con más de 100 animales veía "100" como si fuera su total.
  const animalsQ = useQuery({
    queryKey: ['shelter-animals-count', shelterId, 'all'],
    queryFn: () => searchAnimals({ shelter: shelterId, limit: 1, page: 1 }),
    enabled: !!shelterId,
  });
  const publishedQ = useQuery({
    queryKey: ['shelter-animals-count', shelterId, 'publicado'],
    queryFn: () => searchAnimals({ shelter: shelterId, status: 'publicado', limit: 1, page: 1 }),
    enabled: !!shelterId,
  });
  const adoptionsQ = useQuery({
    queryKey: ['shelter-adoptions', shelterId],
    queryFn: () => listAllAdoptionsForMyAnimals(),
    enabled: !!shelterId,
  });
  const patitasQ = useQuery({
    queryKey: ['patitas-balance', shelterId],
    queryFn: () => getPatitasBalance(shelterId),
    enabled: !!shelterId,
    staleTime: 30_000,
  });
  const metricsQ = useQuery({
    queryKey: ['shelter-metrics', shelterId],
    queryFn: getShelterMetrics,
    enabled: !!shelterId,
    staleTime: 60_000,
  });
  const verificationQ = useQuery({
    queryKey: ['my-verification', shelterId],
    queryFn: () => getMyVerification(shelterId),
    enabled: !!shelterId,
    staleTime: 60_000,
  });

  const adoptions = useMemo(() => adoptionsQ.data?.items || [], [adoptionsQ.data?.items]);
  const openAdoptions = adoptions.filter((a: any) => OPEN_ADOPTION_STATES.includes(a.status)).length;
  const metrics = metricsQ.data;
  // El backend exige verificación aprobada para publicar (`canPublishAnimals`), así
  // que sin ella el CTA principal acabaría en un 403 `shelter_verification_required`.
  // Si no sabemos el estado (error de red) no afirmamos nada y dejamos el CTA normal.
  const verificationStatus = verificationQ.data?.status;
  const cannotPublishYet = !!verificationStatus && verificationStatus !== 'verified';

  const grouped = useMemo(() => {
    const columnOf: Record<string, string> = {};
    for (const column of KANBAN) for (const status of column.statuses) columnOf[status] = column.key;
    const acc: Record<string, any[]> = {};
    for (const column of KANBAN) acc[column.key] = [];
    for (const adoption of adoptions) {
      const key = columnOf[adoption.status];
      if (key) acc[key].push(adoption);
    }
    return acc;
  }, [adoptions]);

  const onExportCsv = async () => {
    setExporting(true);
    try {
      await downloadShelterMetricsCsv();
    } catch {
      // Antes el fallo se tragaba en un `.catch(() => {})` y el botón no hacía nada visible.
      toast.error('No hemos podido generar el CSV. Inténtalo de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink }}>
      <style>{`
        .shelter-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;}
        .shelter-kanban{display:grid;grid-template-columns:repeat(6,minmax(220px,1fr));gap:14px;overflow-x:auto;padding-bottom:8px;}
        @media (max-width: 1080px){.shelter-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width: 620px){.shelter-stats{grid-template-columns:1fr}.shelter-head{display:grid!important;gap:16px}.shelter-head a{width:100%;justify-content:center}}
      `}</style>

      <header className="shelter-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, marginBottom: 26 }}>
        <div>
          <div style={{ fontSize: 13, color: MPL.faint, fontWeight: 700, marginBottom: 4 }}>
            Hola de nuevo{user?.name ? `, ${user.name}` : ''}
          </div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 32, fontWeight: 800, margin: 0 }}>Dashboard</h1>
        </div>
        {cannotPublishYet ? (
          <Link to="/landlord/verificacion" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: MPL.coral, color: '#fff', fontSize: 14.5, fontWeight: 800, padding: '12px 22px', borderRadius: 14, textDecoration: 'none', boxShadow: '0 6px 16px -8px rgba(232,101,74,.7)' }}>
            <ShieldCheck size={17} />
            Verificar protectora
          </Link>
        ) : (
          <Link to="/landlord/animals" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: MPL.coral, color: '#fff', fontSize: 14.5, fontWeight: 800, padding: '12px 22px', borderRadius: 14, textDecoration: 'none', boxShadow: '0 6px 16px -8px rgba(232,101,74,.7)' }}>
            <Plus size={17} />
            Publicar animal
          </Link>
        )}
      </header>

      {cannotPublishYet && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: MPL.gold100, border: `1px solid ${MPL.gold}`, borderRadius: 16, padding: 16, marginBottom: 22 }}>
          <AlertTriangle size={18} color={MPL.goldDark} style={{ flex: 'none', marginTop: 2 }} />
          <div style={{ fontSize: 14 }}>
            <strong>Todavía no puedes publicar animales.</strong>{' '}
            {verificationStatus === 'pending'
              ? 'Estamos revisando la documentación de tu protectora; te avisaremos en cuanto esté aprobada.'
              : verificationStatus === 'rejected'
              ? 'Tu verificación fue rechazada. Revisa las observaciones y vuelve a enviarla.'
              : 'Necesitas verificar tu protectora antes de poder publicar fichas.'}{' '}
            <Link to="/landlord/verificacion" style={{ color: MPL.tealDark, fontWeight: 800 }}>
              Ir a la verificación →
            </Link>
          </div>
        </div>
      )}

      <section className="shelter-stats">
        <StatCard
          icon={<PawMark size={18} />}
          value={animalsQ.isLoading ? '...' : animalsQ.isError ? '—' : animalsQ.data?.total ?? 0}
          label="animales en tu protectora"
          note={publishedQ.data ? `${publishedQ.data.total} publicados` : undefined}
          tone={MPL.teal}
        />
        <StatCard
          icon={<Inbox size={18} />}
          value={adoptionsQ.isLoading ? '...' : adoptionsQ.isError ? '—' : openAdoptions}
          label="solicitudes en proceso"
          note={adoptionsQ.data ? `${adoptionsQ.data.total} en total` : undefined}
          tone={MPL.gold}
        />
        {/* El contador anterior salía de `animals.filter(status==='adoptado')`, pero al
            aprobar una adopción el animal pasa a mascota personal del adoptante y deja
            de salir en el buscador de la protectora: siempre marcaba 0. El histórico
            real son las solicitudes aprobadas que cuenta el endpoint de métricas. */}
        <StatCard
          icon={<CheckCircle2 size={18} />}
          value={metricsQ.isLoading ? '...' : metricsQ.isError ? '—' : metrics?.adopciones.total ?? 0}
          label="adopciones completadas"
          note={metrics ? 'histórico' : undefined}
          tone={MPL.olive}
        />
        <StatCard
          icon={<PawMark size={18} />}
          value={patitasQ.isLoading ? '...' : patitasQ.isError ? '—' : patitasQ.data?.patitas ?? 0}
          label="Patitas disponibles"
          dark
        />
      </section>

      <section style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, fontWeight: 800, margin: 0 }}>Solicitudes de adopción</h2>
          <Link to="/landlord/adoptions" style={{ background: '#fff', border: `1px solid ${MPL.border}`, fontSize: 13, fontWeight: 800, color: MPL.muted, padding: '8px 14px', borderRadius: 10, textDecoration: 'none' }}>
            Gestionar todas →
          </Link>
        </div>

        {adoptionsQ.isError ? (
          <LoadError title="No hemos podido cargar las solicitudes" onRetry={() => adoptionsQ.refetch()} />
        ) : (
          <div style={{ background: '#EAE6DC', borderRadius: 18, padding: 12 }}>
            {adoptionsQ.isLoading ? (
              <div style={{ color: MPL.muted, padding: 18 }}>Cargando solicitudes...</div>
            ) : (
              <div className="shelter-kanban">
                {KANBAN.map(column => {
                  const cards = grouped[column.key] || [];
                  return (
                    <div key={column.key} style={{ minWidth: 220 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 7px 12px' }}>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: column.color }}>{column.title}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: MPL.faint, background: '#fff', padding: '2px 9px', borderRadius: 999 }}>{cards.length}</span>
                      </div>
                      <div style={{ display: 'grid', gap: 9 }}>
                        {cards.slice(0, 4).map((card: any) => (
                          <Link key={card.id || card._id} to={`/adoptions/${card.id || card._id}`} style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 14, padding: 13, textDecoration: 'none', color: MPL.ink, boxShadow: '0 1px 2px rgba(31,55,40,.05)' }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 9 }}>
                              <div style={{ width: 34, height: 34, borderRadius: 9, background: '#E6E0D2', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MPL.teal }}>
                                <HeartHandshake size={17} />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.adopter?.name || 'Adoptante'}</div>
                                <div style={{ fontSize: 11.5, color: MPL.faint }}>para {card.animal?.name || 'Animal'}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                              <span style={{ fontSize: 11.5, color: MPL.muted }}>{ADOPTION_STATUS_LABEL[card.status as keyof typeof ADOPTION_STATUS_LABEL] || card.status}</span>
                              <span style={{ fontSize: 11, color: MPL.faint, fontFamily: MPL_FONT_MONO }}>
                                {card.createdAt ? new Date(card.createdAt).toLocaleDateString() : ''}
                              </span>
                            </div>
                          </Link>
                        ))}
                        {cards.length > 4 && (
                          <Link to="/landlord/adoptions" style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 800, color: MPL.tealDark, textDecoration: 'none', padding: '6px 0' }}>
                            +{cards.length - 4} más →
                          </Link>
                        )}
                        {cards.length === 0 && (
                          <div style={{ background: 'rgba(255,255,255,.55)', border: `1px dashed ${MPL.border}`, borderRadius: 14, padding: 14, color: MPL.faint, fontSize: 13 }}>
                            Sin solicitudes.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* El tablero solo muestra procesos vivos y aprobados; lo cerrado se gestiona en la lista. */}
        {!!adoptionsQ.data && (
          <div style={{ fontSize: 12.5, color: MPL.faint, marginTop: 10 }}>
            Las solicitudes rechazadas o canceladas no aparecen en el tablero: están en “Gestionar todas”.
            {adoptionsQ.data.truncated ? ` Mostrando las ${adoptions.length} más recientes de ${adoptionsQ.data.total}.` : ''}
          </div>
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, fontWeight: 800, margin: 0 }}>Finanzas e impacto</h2>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={exporting}
            style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '8px 16px', fontSize: 13.5, fontWeight: 800, color: MPL.tealDark, cursor: exporting ? 'progress' : 'pointer', opacity: exporting ? 0.6 : 1 }}
          >
            {exporting ? 'Generando...' : '⬇ Exportar CSV'}
          </button>
        </div>
        {metricsQ.isError ? (
          <LoadError title="No hemos podido cargar tus métricas" onRetry={() => metricsQ.refetch()} />
        ) : (
          <>
            <div className="shelter-stats">
              <StatCard
                icon={<HeartHandshake size={18} />}
                value={metricsQ.isLoading ? '...' : eur(metrics?.donaciones.totalEur ?? 0)}
                label="donaciones recibidas"
                note={metrics ? `${eur(metrics.donaciones.esteMesEur)} este mes` : undefined}
                tone={MPL.coral}
              />
              <StatCard
                icon={<PawMark size={18} />}
                value={metricsQ.isLoading ? '...' : metrics?.patitas.recibidas ?? 0}
                label="Patitas recibidas"
                note={metrics ? `${metrics.patitas.canjeadas} canjeadas` : undefined}
                tone={MPL.teal}
              />
              <StatCard
                icon={<CheckCircle2 size={18} />}
                value={metricsQ.isLoading ? '...' : metrics?.adopciones.esteMes ?? 0}
                label="adopciones este mes"
                note={metrics ? `${metrics.adopciones.solicitudesTotales} solicitudes recibidas` : undefined}
                tone={MPL.olive}
              />
              {/* Ojo: ambos números del servidor se calculan solo sobre procesos ya
                  cerrados, y `null` significa "aún no hay ninguno", no cero. */}
              <StatCard
                icon={<Inbox size={18} />}
                value={metricsQ.isLoading ? '...' : metrics?.adopciones.diasMediosProceso != null ? days(metrics.adopciones.diasMediosProceso) : '—'}
                label="días medios hasta la adopción"
                note={metrics?.adopciones.conversionPct != null ? `${metrics.adopciones.conversionPct}% conversión` : undefined}
                tone={MPL.gold}
              />
            </div>
            {!!metrics && (
              <p style={{ fontSize: 12.5, color: MPL.faint, margin: '10px 0 0' }}>
                Los días medios se calculan sobre las solicitudes aprobadas (de la fecha de solicitud a la de
                aprobación) y la conversión es el porcentaje de solicitudes ya cerradas —aprobadas, rechazadas o
                canceladas— que acabaron en adopción. Las solicitudes en curso no cuentan en ninguno de los dos.
              </p>
            )}
          </>
        )}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16, marginTop: 24 }}>
        <Link to="/landlord/animals" style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 20, textDecoration: 'none', color: MPL.ink }}>
          <PawMark size={22} color={MPL.teal} />
          <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800, marginTop: 12 }}>Mis animales</div>
          <div style={{ color: MPL.muted, fontSize: 14, marginTop: 4 }}>Crea, edita y publica fichas.</div>
        </Link>
        <Link to="/landlord/questionnaire" style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 20, textDecoration: 'none', color: MPL.ink }}>
          <ShieldCheck size={22} color={MPL.teal} />
          <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800, marginTop: 12 }}>Cuestionario</div>
          <div style={{ color: MPL.muted, fontSize: 14, marginTop: 4 }}>Define preguntas para candidaturas.</div>
        </Link>
      </section>
    </div>
  );
}
