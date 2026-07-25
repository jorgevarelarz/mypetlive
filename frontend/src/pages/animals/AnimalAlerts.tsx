import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, BellOff, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { deleteAnimalAlert, listAnimalAlerts, updateAnimalAlert, type AnimalAlertFilters } from '../../api/animals';
import MobileBottomNav from '../../components/MobileBottomNav';
import PublicHeader from '../../components/PublicHeader';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, sizeLabel, sexLabel, speciesLabel } from '../../styles/mypetlive';

const AGE_GROUP_LABEL: Record<string, string> = { puppy: 'Cachorro', young: 'Joven', adult: 'Adulto', senior: 'Senior' };

function describeFilters(filters: AnimalAlertFilters) {
  return [
    filters.q && `“${filters.q}”`,
    filters.species && speciesLabel(filters.species),
    filters.size && sizeLabel(filters.size),
    filters.sex && sexLabel(filters.sex),
    filters.city,
    filters.ageGroup && (AGE_GROUP_LABEL[filters.ageGroup] || filters.ageGroup),
    filters.goodWithChildren && 'Convive con niños',
    filters.goodWithDogs && 'Convive con perros',
    filters.goodWithCats && 'Convive con gatos',
  ].filter(Boolean);
}

// El catálogo público lee los filtros de la query string con estas mismas claves
// (`AnimalsPublicList`), así que la alerta se puede volver a ejecutar tal cual.
function filtersToSearch(filters: AnimalAlertFilters) {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const search = params.toString();
  return search ? `/animals?${search}` : '/animals';
}

export default function AnimalAlerts() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['animal-alerts'], queryFn: listAnimalAlerts });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['animal-alerts'] });
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateAnimalAlert(id, { active }),
    onSuccess: refresh,
    // Sin esto, pausar o reactivar una alerta que el servidor rechaza no cambiaba
    // nada en pantalla y parecía que el botón no funcionaba.
    onError: () => toast.error('No se pudo cambiar el estado de la alerta'),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAnimalAlert,
    onSuccess: refresh,
    onError: () => toast.error('No se pudo eliminar la alerta'),
  });
  const alerts = data?.items || [];

  const removeAlert = (id: string) => {
    if (!window.confirm('¿Eliminar esta alerta? Dejarás de recibir avisos de las búsquedas que tenía guardadas.')) return;
    deleteMutation.mutate(id);
  };

  return (
    <div style={{ minHeight: '100vh', background: MPL.bg, color: MPL.ink, fontFamily: MPL_FONT_BODY }}>
      <PublicHeader />
      <main style={{ maxWidth: 980, margin: '0 auto', padding: '42px 32px 100px' }}>
        <div style={{ color: MPL.faint, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          <Link to="/me/favorites" style={{ color: 'inherit', textDecoration: 'none' }}>Favoritos</Link> / Alertas
        </div>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 40, margin: '0 0 8px' }}>Alertas de compañeros</h1>
        <p style={{ color: MPL.muted, margin: '0 0 28px' }}>
          Guardas una búsqueda y te avisamos por email en cuanto una protectora publique un compañero que encaje. Pausa la alerta para dejar de recibir avisos sin perder los filtros.
        </p>

        {isLoading ? (
          <div style={{ color: MPL.muted }}>Cargando alertas...</div>
        ) : isError ? (
          <section style={{ minHeight: 240, display: 'grid', placeItems: 'center', textAlign: 'center', background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, padding: 28 }}>
            <div>
              <AlertTriangle size={32} color={MPL.goldDark} />
              <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, margin: '14px 0 8px' }}>No hemos podido cargar tus alertas</h2>
              <p style={{ color: MPL.muted, margin: '0 0 20px' }}>Ha fallado la conexión con el servidor. Tus alertas siguen activas.</p>
              <button type="button" onClick={() => refetch()} style={{ background: MPL.teal, color: '#fff', border: 0, borderRadius: 14, padding: '13px 20px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>Reintentar</button>
            </div>
          </section>
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
                    {alert.matches === 0
                      ? 'Ningún compañero coincide todavía'
                      : `${alert.matches} ${alert.matches === 1 ? 'compañero coincide' : 'compañeros coinciden'}`}
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11 }}>
                    {describeFilters(alert.filters).map(label => (
                      <span key={String(label)} style={{ background: MPL.bg, color: MPL.muted, borderRadius: 999, padding: '5px 10px', fontSize: 12.5, fontWeight: 700 }}>{label}</span>
                    ))}
                  </div>
                  <div style={{ color: MPL.faint, fontSize: 12.5, marginTop: 11 }}>
                    {alert.active ? 'Activa' : 'En pausa: no recibirás avisos'}
                    {alert.createdAt && ` · guardada el ${new Date(alert.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link to={filtersToSearch(alert.filters)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${MPL.border}`, background: '#fff', color: MPL.ink, borderRadius: 12, padding: '10px 13px', fontWeight: 800, textDecoration: 'none' }}>
                    <Search size={16} />
                    Ver resultados
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate({ id: alert._id, active: !alert.active })}
                    disabled={toggleMutation.isPending}
                    style={{ border: `1px solid ${MPL.border}`, background: '#fff', color: MPL.teal, borderRadius: 12, padding: '10px 13px', font: 'inherit', fontWeight: 800, cursor: toggleMutation.isPending ? 'progress' : 'pointer', opacity: toggleMutation.isPending ? .6 : 1 }}
                  >
                    {alert.active ? 'Pausar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAlert(alert._id)}
                    disabled={deleteMutation.isPending}
                    aria-label="Eliminar alerta"
                    title="Eliminar alerta"
                    style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', border: `1px solid ${MPL.border}`, background: '#fff', color: MPL.coral, borderRadius: 12, cursor: deleteMutation.isPending ? 'progress' : 'pointer', opacity: deleteMutation.isPending ? .6 : 1 }}
                  >
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
