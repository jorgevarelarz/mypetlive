import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bell, Heart, MapPin, MonitorSmartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { getAnimal } from '../api/animals';
import MobileBottomNav from '../components/MobileBottomNav';
import PublicHeader from '../components/PublicHeader';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, sizeLabel, speciesLabel, statusLabel } from '../styles/mypetlive';
import { useAnimalFavorites } from '../hooks/useAnimalFavorites';
import { useAuth } from '../context/AuthContext';
import { toAbsoluteUrl } from '../utils/media';

// Estados de los que ya no se puede adoptar: la ficha se muestra apagada para no
// hacer creer al adoptante que el animal sigue disponible.
const CLOSED_STATUSES = new Set(['adoptado', 'no_disponible', 'archivado', 'borrador']);

// Vocabulario de cara al adoptante: `publicado` es jerga de la protectora.
const ADOPTER_STATUS_LABEL: Record<string, string> = {
  publicado: 'Disponible',
  reservado: 'Reservado',
  preadoptado: 'En preadopción',
  adoptado: 'Adoptado',
  no_disponible: 'No disponible',
  archivado: 'No disponible',
  borrador: 'No publicado',
};

export default function Favorites() {
  const { user } = useAuth();
  const favorites = useAnimalFavorites();
  const { data: localItems = [], isLoading: localLoading, isError: localError } = useQuery({
    queryKey: ['favorite-animals-local', favorites.ids],
    queryFn: async () => {
      const results = await Promise.allSettled(favorites.ids.map(getAnimal));
      const loaded = results
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value)
        .filter(animal => !animal?.isPersonalPet);
      // Un 404 es un favorito obsoleto (adoptado y traspasado, o borrado); el resto
      // son fallos de red. Si no se pudo cargar NINGUNO por un fallo de red, hay que
      // reventar: con `allSettled` la caída se pintaba como "no tienes favoritos".
      const networkFailure = results.some(
        result => result.status === 'rejected' && (result.reason as any)?.response?.status !== 404,
      );
      if (!loaded.length && networkFailure) throw new Error('favorites_fetch_failed');
      return loaded;
    },
    enabled: favorites.items.length === 0 && favorites.ids.length > 0,
  });

  const items = favorites.items.length ? favorites.items : localItems;
  const isLoading = favorites.isLoading || localLoading;
  const isError = favorites.isError || localError;
  // Un favorito cuyo animal se traspasó al adoptante (adopción aprobada → mascota
  // personal) o se borró sigue en `ids` pero ya no llega en `items`: sin avisar,
  // el adoptante ve desaparecer favoritos sin explicación y sin poder limpiarlos.
  const visibleIds = new Set(items.map((animal: any) => String(animal._id || animal.id)));
  const staleIds = isLoading || isError ? [] : favorites.ids.filter(id => !visibleIds.has(String(id)));

  const removeFavorite = (id: string, name?: string) => {
    if (favorites.isPending(id)) return;
    // `toggle` propaga el error del servidor: sin catch quedaba como promesa
    // rechazada sin capturar y el corazón volvía a su sitio sin explicación.
    Promise.resolve(favorites.toggle(id)).catch(() => {
      toast.error(`No se pudo quitar ${name || 'este compañero'} de favoritos`);
    });
  };

  const removeStale = () => {
    staleIds.forEach(id => removeFavorite(id));
  };

  return (
    <div style={{ minHeight: '100vh', background: MPL.bg, color: MPL.ink, fontFamily: MPL_FONT_BODY }}>
      <style>{`
        .favorites-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
        .favorite-card{transition:transform .18s ease,box-shadow .18s ease}
        .favorite-card:hover{transform:translateY(-4px);box-shadow:0 22px 44px -24px rgba(31,55,40,.32)!important}
        @media(max-width:900px){.favorites-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:640px){.favorites-main{padding:28px 20px 100px!important}.favorites-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.favorite-image{height:130px!important}.favorite-body{padding:13px!important}}
        @media(max-width:390px){.favorites-grid{grid-template-columns:1fr}}
      `}</style>
      <PublicHeader />
      <main className="favorites-main" style={{ maxWidth: 1180, margin: '0 auto', padding: '42px 32px 72px' }}>
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div>
          <div style={{ color: MPL.faint, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Inicio</Link> / Favoritos
          </div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 40, lineHeight: 1.1, margin: '0 0 8px', fontWeight: 800 }}>Tus favoritos</h1>
          <p style={{ color: MPL.muted, margin: 0 }}>Los compañeros que has guardado para conocerlos mejor.</p>
          </div>
          <Link to="/me/alerts" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: MPL.teal, border: `1.5px solid ${MPL.teal}`, borderRadius: 13, padding: '11px 16px', textDecoration: 'none', fontWeight: 800 }}>
            <Bell size={17} />
            Mis alertas
          </Link>
        </div>

        {!user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 14, padding: '13px 16px', marginBottom: 20, color: MPL.muted, fontSize: 13.5 }}>
            <MonitorSmartphone size={18} color={MPL.faint} />
            <span>
              Estos favoritos se guardan <strong>solo en este dispositivo</strong>.{' '}
              <Link to="/login" style={{ color: MPL.teal, fontWeight: 800 }}>Inicia sesión</Link> para conservarlos y verlos desde el móvil.
            </span>
          </div>
        )}

        {staleIds.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: MPL.gold100, border: `1px solid ${MPL.gold}`, borderRadius: 14, padding: '13px 16px', marginBottom: 20, color: MPL.goldDark, fontSize: 13.5 }}>
            <span>
              {staleIds.length === 1
                ? 'Uno de tus favoritos ya no está en adopción (encontró familia o la protectora retiró su ficha).'
                : `${staleIds.length} de tus favoritos ya no están en adopción (encontraron familia o la protectora retiró su ficha).`}
            </span>
            <button type="button" onClick={removeStale} style={{ border: `1.5px solid ${MPL.goldDark}`, background: 'transparent', color: MPL.goldDark, borderRadius: 11, padding: '8px 13px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
              Quitarlos de la lista
            </button>
          </div>
        )}

        {isLoading ? (
          <div style={{ color: MPL.muted }}>Cargando favoritos...</div>
        ) : isError ? (
          <section style={{ minHeight: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, padding: 32 }}>
            <span style={{ width: 60, height: 60, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MPL.goldDark, background: MPL.gold100, marginBottom: 16 }}>
              <AlertTriangle size={28} />
            </span>
            <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, margin: '0 0 8px' }}>No hemos podido cargar tus favoritos</h2>
            <p style={{ color: MPL.muted, margin: '0 0 20px', maxWidth: 420 }}>Ha fallado la conexión con el servidor. Tus favoritos siguen guardados: vuelve a intentarlo.</p>
            <button type="button" onClick={() => window.location.reload()} style={{ background: MPL.teal, color: '#fff', border: 0, fontWeight: 800, padding: '13px 20px', borderRadius: 13, font: 'inherit', cursor: 'pointer' }}>
              Reintentar
            </button>
          </section>
        ) : items.length === 0 ? (
          <section style={{ minHeight: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, padding: 32 }}>
            <span style={{ width: 64, height: 64, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MPL.coral, background: '#FCE9E4', marginBottom: 18 }}>
              <Heart size={30} />
            </span>
            <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, margin: '0 0 8px' }}>¡No tienes favoritos!</h2>
            <p style={{ color: MPL.muted, margin: '0 0 22px', maxWidth: 430 }}>Guarda los animales que te interesen y aparecerán aquí.</p>
            <Link to="/animals" style={{ background: MPL.coral, color: '#fff', textDecoration: 'none', fontWeight: 800, padding: '14px 22px', borderRadius: 14 }}>
              Encuentra a tu compañero hoy
            </Link>
          </section>
        ) : (
          <div className="favorites-grid">
            {items.map((animal: any) => {
              const id = String(animal._id || animal.id);
              const image = Array.isArray(animal.images) ? animal.images[0] : null;
              const shelterName = typeof animal.shelter === 'object' ? animal.shelter?.name : '';
              const meta = [speciesLabel(animal.species), sizeLabel(animal.size), animal.age].filter(Boolean).join(' · ');
              const isClosed = CLOSED_STATUSES.has(animal.status);
              const chip = isClosed
                ? { background: MPL.panel, color: MPL.muted }
                : animal.status === 'publicado'
                  ? { background: MPL.teal100, color: MPL.tealDark }
                  : { background: MPL.gold100, color: MPL.goldDark };
              return (
                <article key={id} className="favorite-card" style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, border: `1px solid ${MPL.border}`, background: '#fff', boxShadow: '0 8px 24px -16px rgba(31,55,40,.18)' }}>
                  <Link to={`/animals/${id}`} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                    <div className="favorite-image" style={{ height: 210, background: '#E6E0D2' }}>
                      {image ? <img src={toAbsoluteUrl(image)} alt={animal.name} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isClosed ? 'grayscale(.7)' : undefined, opacity: isClosed ? .78 : 1 }} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: MPL.faint }}>Sin imagen</div>}
                      <span style={{ position: 'absolute', top: 12, left: 12, background: chip.background, color: chip.color, fontSize: 11.5, fontWeight: 800, padding: '5px 10px', borderRadius: 8 }}>
                        {ADOPTER_STATUS_LABEL[animal.status] || statusLabel(animal.status)}
                      </span>
                    </div>
                    <div className="favorite-body" style={{ padding: '17px 18px 20px' }}>
                      <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, margin: '0 0 5px' }}>{animal.name}</h2>
                      <div style={{ color: MPL.muted, fontSize: 13 }}>{meta || 'Información pendiente'}</div>
                      {isClosed && (
                        <div style={{ color: MPL.faint, fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>Ya no se puede solicitar en adopción</div>
                      )}
                      {shelterName && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: MPL.faint, fontSize: 12.5, marginTop: 12 }}>
                          <MapPin size={14} />
                          {shelterName}
                        </div>
                      )}
                    </div>
                  </Link>
                  <button
                    type="button"
                    aria-label={`Quitar a ${animal.name} de favoritos`}
                    title="Quitar de favoritos"
                    onClick={() => removeFavorite(id, animal.name)}
                    disabled={favorites.isPending(id)}
                    style={{ position: 'absolute', top: 12, right: 12, width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 13, border: 0, background: 'rgba(255,255,255,.94)', color: MPL.coral, boxShadow: '0 6px 18px -8px rgba(31,55,40,.4)', cursor: favorites.isPending(id) ? 'progress' : 'pointer', opacity: favorites.isPending(id) ? .6 : 1 }}
                  >
                    <Heart size={21} fill="currentColor" />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <MobileBottomNav />
    </div>
  );
}
