import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, HeartHandshake, Inbox, Plus, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { searchAnimals } from '../../api/animals';
import { ADOPTION_STATUS_LABEL, listAdoptionsForMyAnimals } from '../../api/adoptions';
import { getPatitasBalance } from '../../api/patitas';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, MPL_FONT_MONO, PawMark } from '../../styles/mypetlive';

const OPEN_ADOPTION_STATES = ['recibida', 'cuestionario_pendiente', 'en_revision', 'info_adicional', 'cita_propuesta', 'preaprobada'];
const KANBAN = [
  { key: 'recibida', title: 'Recibida', color: MPL.goldDark },
  { key: 'en_revision', title: 'En revisión', color: MPL.goldDark },
  { key: 'cita_propuesta', title: 'Cita propuesta', color: MPL.coralDark },
  { key: 'preaprobada', title: 'Preaprobada', color: MPL.tealDark },
  { key: 'aprobada', title: 'Aprobada', color: MPL.oliveDark },
];

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

export default function ProtectoraDashboard() {
  const { user } = useAuth();
  const shelterId = String(user?._id || '');

  const animalsQ = useQuery({
    queryKey: ['shelter-animals', shelterId],
    queryFn: () => searchAnimals({ shelter: shelterId, limit: 100, page: 1, sort: 'createdAt', dir: 'desc' }),
    enabled: !!shelterId,
  });
  const adoptionsQ = useQuery({
    queryKey: ['shelter-adoptions', shelterId],
    queryFn: () => listAdoptionsForMyAnimals({ page: 1, limit: 100 }),
    enabled: !!shelterId,
  });
  const patitasQ = useQuery({
    queryKey: ['patitas-balance', shelterId],
    queryFn: () => getPatitasBalance(shelterId),
    enabled: !!shelterId,
    staleTime: 30_000,
  });

  const animals = useMemo(() => animalsQ.data?.items || [], [animalsQ.data?.items]);
  const adoptions = useMemo(() => adoptionsQ.data?.items || [], [adoptionsQ.data?.items]);
  const published = animals.filter((animal: any) => animal.status === 'publicado').length;
  const adopted = animals.filter((animal: any) => animal.status === 'adoptado').length;
  const openAdoptions = adoptions.filter((a: any) => OPEN_ADOPTION_STATES.includes(a.status)).length;
  const grouped = useMemo(() => {
    const acc: Record<string, any[]> = {};
    for (const column of KANBAN) acc[column.key] = [];
    for (const adoption of adoptions) {
      if (acc[adoption.status]) acc[adoption.status].push(adoption);
    }
    return acc;
  }, [adoptions]);

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink }}>
      <style>{`
        .shelter-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;}
        .shelter-kanban{display:grid;grid-template-columns:repeat(5,minmax(220px,1fr));gap:14px;overflow-x:auto;padding-bottom:8px;}
        @media (max-width: 1080px){.shelter-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width: 620px){.shelter-stats{grid-template-columns:1fr}.shelter-head{display:grid!important;gap:16px}.shelter-head a{width:100%;justify-content:center}}
      `}</style>

      <header className="shelter-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, marginBottom: 26 }}>
        <div>
          <div style={{ fontSize: 13, color: MPL.faint, fontWeight: 700, marginBottom: 4 }}>Hola de nuevo</div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 32, fontWeight: 800, margin: 0 }}>Dashboard</h1>
        </div>
        <Link to="/landlord/animals" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: MPL.coral, color: '#fff', fontSize: 14.5, fontWeight: 800, padding: '12px 22px', borderRadius: 14, textDecoration: 'none', boxShadow: '0 6px 16px -8px rgba(232,101,74,.7)' }}>
          <Plus size={17} />
          Publicar animal
        </Link>
      </header>

      <section className="shelter-stats">
        <StatCard icon={<PawMark size={18} />} value={animalsQ.isLoading ? '...' : animals.length} label="animales en total" note={`${published} publicados`} tone={MPL.teal} />
        <StatCard icon={<Inbox size={18} />} value={adoptionsQ.isLoading ? '...' : openAdoptions} label="solicitudes en proceso" note={`${adoptions.length} total`} tone={MPL.gold} />
        <StatCard icon={<CheckCircle2 size={18} />} value={animalsQ.isLoading ? '...' : adopted} label="adopciones cerradas" note="histórico" tone={MPL.olive} />
        <StatCard icon={<PawMark size={18} />} value={patitasQ.isLoading ? '...' : (patitasQ.data?.patitas ?? 0)} label="Patitas disponibles" note="impacto" dark />
      </section>

      <section style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, fontWeight: 800, margin: 0 }}>Solicitudes de adopción</h2>
          <Link to="/landlord/adoptions" style={{ background: '#fff', border: `1px solid ${MPL.border}`, fontSize: 13, fontWeight: 800, color: MPL.muted, padding: '8px 14px', borderRadius: 10, textDecoration: 'none' }}>
            Gestionar todas →
          </Link>
        </div>

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
