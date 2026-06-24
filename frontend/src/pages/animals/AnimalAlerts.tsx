import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { deleteAnimalAlert, listAnimalAlerts, updateAnimalAlert, type AnimalAlertFilters } from '../../api/animals';
import MobileBottomNav from '../../components/MobileBottomNav';
import PublicHeader from '../../components/PublicHeader';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, sizeLabel, speciesLabel } from '../../styles/mypetlive';

function describeFilters(filters: AnimalAlertFilters) {
  return [
    filters.q && `“${filters.q}”`,
    filters.species && speciesLabel(filters.species),
    filters.size && sizeLabel(filters.size),
    filters.sex && (filters.sex === 'female' ? 'Hembra' : 'Macho'),
    filters.city,
    filters.ageGroup && ({ puppy: 'Cachorro', young: 'Joven', adult: 'Adulto', senior: 'Senior' }[filters.ageGroup]),
    filters.goodWithChildren && 'Convive con niños',
    filters.goodWithDogs && 'Convive con perros',
    filters.goodWithCats && 'Convive con gatos',
  ].filter(Boolean);
}

export default function AnimalAlerts() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['animal-alerts'], queryFn: listAnimalAlerts });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['animal-alerts'] });
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateAnimalAlert(id, { active }),
    onSuccess: refresh,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAnimalAlert,
    onSuccess: refresh,
  });
  const alerts = data?.items || [];

  return (
    <div style={{ minHeight: '100vh', background: MPL.bg, color: MPL.ink, fontFamily: MPL_FONT_BODY }}>
      <PublicHeader />
      <main style={{ maxWidth: 980, margin: '0 auto', padding: '42px 32px 100px' }}>
        <div style={{ color: MPL.faint, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          <Link to="/me/favorites" style={{ color: 'inherit', textDecoration: 'none' }}>Favoritos</Link> / Alertas
        </div>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 40, margin: '0 0 8px' }}>Alertas de compañeros</h1>
        <p style={{ color: MPL.muted, margin: '0 0 28px' }}>Guarda búsquedas para volver cuando aparezcan nuevos compañeros compatibles.</p>

        {isLoading ? (
          <div style={{ color: MPL.muted }}>Cargando alertas...</div>
        ) : alerts.length === 0 ? (
          <section style={{ minHeight: 320, display: 'grid', placeItems: 'center', textAlign: 'center', background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, padding: 28 }}>
            <div>
              <Bell size={34} color={MPL.teal} />
              <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 25, margin: '14px 0 8px' }}>No tienes alertas</h2>
              <p style={{ color: MPL.muted, margin: '0 0 20px' }}>Aplica filtros en Compañeros y guarda la búsqueda.</p>
              <Link to="/animals" style={{ display: 'inline-block', background: MPL.coral, color: '#fff', textDecoration: 'none', borderRadius: 14, padding: '13px 20px', fontWeight: 800 }}>Buscar compañeros</Link>
            </div>
          </section>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {alerts.map(alert => (
              <article key={alert._id} style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap', opacity: alert.active ? 1 : .68 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 800 }}>
                    {alert.active ? <Bell size={18} color={MPL.teal} /> : <BellOff size={18} color={MPL.faint} />}
                    {alert.matches} {alert.matches === 1 ? 'compañero coincide' : 'compañeros coinciden'}
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11 }}>
                    {describeFilters(alert.filters).map(label => (
                      <span key={String(label)} style={{ background: MPL.bg, color: MPL.muted, borderRadius: 999, padding: '5px 10px', fontSize: 12.5, fontWeight: 700 }}>{label}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => toggleMutation.mutate({ id: alert._id, active: !alert.active })} style={{ border: `1px solid ${MPL.border}`, background: '#fff', color: MPL.teal, borderRadius: 12, padding: '10px 13px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                    {alert.active ? 'Pausar' : 'Activar'}
                  </button>
                  <button type="button" onClick={() => deleteMutation.mutate(alert._id)} aria-label="Eliminar alerta" title="Eliminar alerta" style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', border: `1px solid ${MPL.border}`, background: '#fff', color: MPL.coral, borderRadius: 12, cursor: 'pointer' }}>
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      <MobileBottomNav />
    </div>
  );
}
