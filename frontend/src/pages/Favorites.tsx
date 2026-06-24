import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getAnimal } from '../api/animals';
import MobileBottomNav from '../components/MobileBottomNav';
import PublicHeader from '../components/PublicHeader';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, sizeLabel, speciesLabel } from '../styles/mypetlive';
import { getFavorites, toggleFavorite } from '../utils/favorites';
import { toAbsoluteUrl } from '../utils/media';

export default function Favorites() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(getFavorites);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['favorite-animals', favoriteIds],
    queryFn: async () => {
      const results = await Promise.allSettled(favoriteIds.map(getAnimal));
      return results
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value)
        .filter(animal => !animal?.isPersonalPet);
    },
    enabled: favoriteIds.length > 0,
  });

  const removeFavorite = (id: string) => {
    setFavoriteIds(toggleFavorite(id));
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
        <div style={{ marginBottom: 28 }}>
          <div style={{ color: MPL.faint, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Inicio</Link> / Favoritos
          </div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 40, lineHeight: 1.1, margin: '0 0 8px', fontWeight: 800 }}>Tus favoritos</h1>
          <p style={{ color: MPL.muted, margin: 0 }}>Los compañeros que has guardado para conocerlos mejor.</p>
        </div>

        {isLoading ? (
          <div style={{ color: MPL.muted }}>Cargando favoritos...</div>
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
              return (
                <article key={id} className="favorite-card" style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, border: `1px solid ${MPL.border}`, background: '#fff', boxShadow: '0 8px 24px -16px rgba(31,55,40,.18)' }}>
                  <Link to={`/animals/${id}`} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                    <div className="favorite-image" style={{ height: 210, background: '#E6E0D2' }}>
                      {image ? <img src={toAbsoluteUrl(image)} alt={animal.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: MPL.faint }}>Sin imagen</div>}
                    </div>
                    <div className="favorite-body" style={{ padding: '17px 18px 20px' }}>
                      <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, margin: '0 0 5px' }}>{animal.name}</h2>
                      <div style={{ color: MPL.muted, fontSize: 13 }}>{meta || 'Información pendiente'}</div>
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
                    onClick={() => removeFavorite(id)}
                    style={{ position: 'absolute', top: 12, right: 12, width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 13, border: 0, background: 'rgba(255,255,255,.94)', color: MPL.coral, boxShadow: '0 6px 18px -8px rgba(31,55,40,.4)', cursor: 'pointer' }}
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
