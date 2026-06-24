import React, { useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Bell, ChevronLeft, ChevronRight, Heart, Search, SlidersHorizontal, X } from 'lucide-react';
import { createAnimalAlert, searchAnimals, type AnimalAlertFilters } from '../../api/animals';
import SkeletonGrid from '../../components/ui/SkeletonGrid';
import ErrorCard from '../../components/ui/ErrorCard';
import { toAbsoluteUrl } from '../../utils/media';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, sizeLabel, speciesLabel, statusLabel } from '../../styles/mypetlive';
import MobileBottomNav from '../../components/MobileBottomNav';
import { useAuthModal } from '../../context/AuthModalContext';
import { useAnimalFavorites } from '../../hooks/useAnimalFavorites';
import PublicHeader from '../../components/PublicHeader';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

const speciesOptions = [
  { label: 'Perro', value: 'perro' },
  { label: 'Gato', value: 'gato' },
  { label: 'Otros', value: 'other' },
];

const sizeOptions = [
  { label: 'Pequeño', value: 'small' },
  { label: 'Mediano', value: 'medium' },
  { label: 'Grande', value: 'large' },
];

const sexOptions = [
  { label: 'Hembra', value: 'female' },
  { label: 'Macho', value: 'male' },
];

const ageOptions = [
  { label: 'Cachorro', value: 'puppy' },
  { label: 'Joven', value: 'young' },
  { label: 'Adulto', value: 'adult' },
  { label: 'Senior', value: 'senior' },
];

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? `1.5px solid ${MPL.teal}` : `1.5px solid ${MPL.border}`,
        background: active ? MPL.teal : MPL.card,
        color: active ? '#fff' : MPL.ink,
        borderRadius: 999,
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export default function AnimalsPublicList() {
  const { openAuth } = useAuthModal();
  const { user } = useAuth();
  const favorites = useAnimalFavorites();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') || '1');
  const limit = Number(sp.get('limit') || '12');
  const q = sp.get('q') || undefined;
  const species = sp.get('species') || undefined;
  const size = (sp.get('size') as 'small' | 'medium' | 'large' | null) || undefined;
  const sex = (sp.get('sex') as 'male' | 'female' | null) || undefined;
  const city = sp.get('city') || undefined;
  const ageGroup = (sp.get('ageGroup') as 'puppy' | 'young' | 'adult' | 'senior' | null) || undefined;
  const goodWithChildren = sp.get('goodWithChildren') === 'true' || undefined;
  const goodWithDogs = sp.get('goodWithDogs') === 'true' || undefined;
  const goodWithCats = sp.get('goodWithCats') === 'true' || undefined;
  const sort = (sp.get('sort') as 'createdAt' | 'name' | 'age' | null) || 'createdAt';
  const dir = (sp.get('dir') as 'asc' | 'desc' | null) || (sort === 'name' ? 'asc' : 'desc');

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setSp(next, { replace: false });
  };

  const clearFilters = () => {
    setSp({ page: '1', limit: String(limit) }, { replace: false });
  };

  const setFilterPage = (p: number) => {
    const next = new URLSearchParams(sp);
    next.set('page', String(p));
    setSp(next, { replace: false });
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['animals-public', { q, species, size, sex, city, ageGroup, goodWithChildren, goodWithDogs, goodWithCats, sort, dir, page, limit }],
    queryFn: () => searchAnimals({ q, species, size, sex, city, ageGroup, goodWithChildren, goodWithDogs, goodWithCats, sort, dir, page, limit }),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  const activeFilters = [
    q && `Busqueda: ${q}`,
    species && speciesLabel(species),
    size && sizeLabel(size),
    sex && (sex === 'female' ? 'Hembra' : 'Macho'),
    city,
    ageGroup && ageOptions.find(option => option.value === ageGroup)?.label,
    goodWithChildren && 'Convive con niños',
    goodWithDogs && 'Convive con perros',
    goodWithCats && 'Convive con gatos',
  ].filter(Boolean);

  const alertFilters: AnimalAlertFilters = {
    q,
    species,
    size,
    sex,
    city,
    ageGroup,
    goodWithChildren,
    goodWithDogs,
    goodWithCats,
  };

  const alertMutation = useMutation({
    mutationFn: () => createAnimalAlert(alertFilters),
    onSuccess: () => toast.success('Alerta guardada'),
    onError: () => toast.error('No se pudo guardar la alerta'),
  });

  const saveAlert = () => {
    if (!user) {
      openAuth({
        mode: 'register',
        message: 'Crea tu cuenta para guardar esta alerta.',
        onSuccess: () => alertMutation.mutate(),
      });
      return;
    }
    alertMutation.mutate();
  };

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, background: MPL.bg, color: MPL.ink, minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        .catalog-link{color:inherit;text-decoration:none;}
        .catalog-link:hover{color:${MPL.teal};}
        .catalog-card{transition:transform .18s ease, box-shadow .18s ease;}
        .catalog-card:hover{transform:translateY(-4px);box-shadow:0 1px 3px rgba(31,55,40,.06),0 22px 44px -24px rgba(31,55,40,.32) !important;}
        .catalog-grid{display:grid;grid-template-columns:260px minmax(0,1fr);gap:28px;box-sizing:border-box;width:100%;max-width:100vw;}
        .catalog-results{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;width:100%;min-width:0;}
        .catalog-card{min-width:0;}
        .catalog-filter-trigger{display:none!important}
        .catalog-filter-close{display:none!important}
        @media (max-width: 980px){.catalog-results{grid-template-columns:repeat(2,minmax(0,1fr));}}
        @media (max-width: 720px){
          .catalog-grid{grid-template-columns:minmax(0,1fr)!important}
          .catalog-grid > section{min-width:0}
          .catalog-filter-trigger{display:flex!important}
          .catalog-filter-close{display:grid!important}
          .catalog-filter-overlay{display:block!important}
          .catalog-aside{display:none;position:fixed!important;inset:0 0 0 auto!important;z-index:51!important;width:min(88vw,360px)!important;height:100dvh!important;overflow-y:auto!important;border-radius:0!important;padding:22px!important}
          .catalog-aside.is-open{display:block!important}
        }
        @media (max-width: 640px){.catalog-results{grid-template-columns:minmax(0,1fr)!important;width:calc(100vw - 40px)!important;max-width:calc(100vw - 40px)!important;gap:14px}.catalog-hero{padding:22px 20px 16px!important}.catalog-search{align-items:stretch!important;flex-wrap:wrap}.catalog-search > label{flex-basis:100%!important}.catalog-grid{padding:0 20px 92px!important}.catalog-results .catalog-card{border-radius:16px!important}.catalog-results .catalog-card > a > div:first-child{height:190px!important}.catalog-results .catalog-card > a > div:last-child{padding:14px 16px 17px!important}}
      `}</style>

      <PublicHeader />

      <main style={{ width: '100%', maxWidth: 1180, margin: '0 auto', boxSizing: 'border-box' }}>
        <header className="catalog-hero" style={{ width: '100%', boxSizing: 'border-box', padding: '42px 32px 28px' }}>
          <div style={{ fontSize: 13, color: MPL.faint, fontWeight: 700, marginBottom: 8 }}>
            <Link to="/" className="catalog-link">Inicio</Link> / Compañeros
          </div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 40, fontWeight: 800, margin: '0 0 6px' }}>
            Compañeros en adopción
          </h1>
          <p style={{ fontSize: 16, color: MPL.muted, margin: 0 }}>
            <strong style={{ color: MPL.ink }}>{total}</strong> compañeros buscando hogar en protectoras verificadas.
          </p>

          <div className="catalog-search" style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 14, padding: '0 18px' }}>
              <Search size={18} color={MPL.faint} />
              <input
                aria-label="Buscar animales"
                placeholder="Busca por nombre, raza o ciudad"
                defaultValue={q || ''}
                onKeyDown={e => {
                  if (e.key === 'Enter') setFilter('q', (e.target as HTMLInputElement).value.trim());
                }}
                style={{ flex: 1, minWidth: 0, height: 46, border: 0, outline: 0, font: 'inherit', color: MPL.ink, background: 'transparent' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 14, padding: '0 14px', fontSize: 14.5, fontWeight: 700 }}>
              <span className="sr-only">Ordenar</span>
              <select
                aria-label="Ordenar compañeros"
                value={`${sort}:${dir}`}
                onChange={event => {
                  const [nextSort, nextDir] = event.target.value.split(':');
                  const next = new URLSearchParams(sp);
                  next.set('sort', nextSort);
                  next.set('dir', nextDir);
                  next.set('page', '1');
                  setSp(next);
                }}
                style={{ height: 46, border: 0, outline: 0, background: 'transparent', color: MPL.ink, font: 'inherit', fontWeight: 700 }}
              >
                <option value="createdAt:desc">Más recientes</option>
                <option value="name:asc">Nombre A-Z</option>
                <option value="age:asc">Menor edad</option>
                <option value="age:desc">Mayor edad</option>
              </select>
            </label>
            <button className="catalog-filter-trigger" type="button" onClick={() => setFiltersOpen(true)} style={{ alignItems: 'center', justifyContent: 'center', gap: 8, border: `1.5px solid ${MPL.border}`, background: '#fff', borderRadius: 14, padding: '0 15px', height: 48, font: 'inherit', fontWeight: 800, color: MPL.ink }}>
              <SlidersHorizontal size={17} color={MPL.teal} />
              Filtros{activeFilters.length ? ` (${activeFilters.length})` : ''}
            </button>
          </div>
        </header>

        <div className="catalog-grid" style={{ padding: '0 32px 56px' }}>
          {filtersOpen && <button className="catalog-filter-overlay" type="button" aria-label="Cerrar filtros" onClick={() => setFiltersOpen(false)} style={{ display: 'none', position: 'fixed', inset: 0, zIndex: 50, border: 0, background: 'rgba(31,55,40,.42)' }} />}
          <aside className={`catalog-aside${filtersOpen ? ' is-open' : ''}`} style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, padding: 24, position: 'sticky', top: 90, alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, fontWeight: 800 }}>Filtros</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {activeFilters.length > 0 && (
                  <button type="button" onClick={clearFilters} style={{ border: 0, background: 'none', color: MPL.coral, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                    Limpiar
                  </button>
                )}
                <button className="catalog-filter-close" type="button" onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros" style={{ width: 36, height: 36, placeItems: 'center', border: `1px solid ${MPL.border}`, background: '#fff', borderRadius: 11, color: MPL.muted }}>
                  <X size={17} />
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: MPL.faint, fontWeight: 800, marginBottom: 11 }}>Especie</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {speciesOptions.map(option => (
                  <Chip key={option.value} active={species === option.value} onClick={() => setFilter('species', species === option.value ? '' : option.value)}>
                    {option.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 22, borderTop: `1px solid ${MPL.bg}`, paddingTop: 20 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: MPL.faint, fontWeight: 800, marginBottom: 11 }}>Tamaño</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {sizeOptions.map(option => (
                  <button key={option.value} type="button" onClick={() => setFilter('size', size === option.value ? '' : option.value)} style={{ border: 0, background: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: 10, font: 'inherit', fontSize: 14, cursor: 'pointer', color: MPL.ink }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${size === option.value ? MPL.teal : '#D8D3C6'}`, background: size === option.value ? MPL.teal : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                      {size === option.value ? '✓' : ''}
                    </span>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${MPL.bg}`, paddingTop: 20, marginBottom: 22 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: MPL.faint, fontWeight: 800, marginBottom: 11 }}>Sexo</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {sexOptions.map(option => (
                  <Chip key={option.value} active={sex === option.value} onClick={() => setFilter('sex', sex === option.value ? '' : option.value)}>
                    {option.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${MPL.bg}`, paddingTop: 20, marginBottom: 22 }}>
              <label style={{ display: 'grid', gap: 8, fontSize: 12, textTransform: 'uppercase', color: MPL.faint, fontWeight: 800 }}>
                Ciudad
                <input
                  type="search"
                  defaultValue={city || ''}
                  placeholder="Madrid, Valencia..."
                  onKeyDown={event => {
                    if (event.key === 'Enter') setFilter('city', event.currentTarget.value.trim());
                  }}
                  style={{ width: '100%', height: 42, border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '0 12px', color: MPL.ink, font: 'inherit', textTransform: 'none', fontWeight: 600, outline: 0 }}
                />
              </label>
            </div>

            <div style={{ borderTop: `1px solid ${MPL.bg}`, paddingTop: 20, marginBottom: 22 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: MPL.faint, fontWeight: 800, marginBottom: 11 }}>Edad</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ageOptions.map(option => (
                  <Chip key={option.value} active={ageGroup === option.value} onClick={() => setFilter('ageGroup', ageGroup === option.value ? '' : option.value)}>
                    {option.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${MPL.bg}`, paddingTop: 20 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: MPL.faint, fontWeight: 800, marginBottom: 11 }}>Convivencia</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {[
                  ['goodWithChildren', 'Con niños', goodWithChildren],
                  ['goodWithDogs', 'Con perros', goodWithDogs],
                  ['goodWithCats', 'Con gatos', goodWithCats],
                ].map(([key, label, active]) => (
                  <button key={String(key)} type="button" onClick={() => setFilter(String(key), active ? '' : 'true')} style={{ border: 0, background: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: 10, font: 'inherit', fontSize: 14, cursor: 'pointer', color: MPL.ink }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${active ? MPL.teal : '#D8D3C6'}`, background: active ? MPL.teal : '#fff', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12 }}>
                      {active ? '✓' : ''}
                    </span>
                    {String(label)}
                  </button>
                ))}
              </div>
            </div>

            <button type="button" onClick={() => setFiltersOpen(false)} className="catalog-filter-trigger" style={{ width: '100%', marginTop: 24, alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 13, padding: '13px 16px', background: MPL.teal, color: '#fff', font: 'inherit', fontWeight: 800 }}>
              Ver {total} compañeros
            </button>
          </aside>

          <section>
            {activeFilters.length > 0 && (
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
                <span style={{ fontSize: 13, color: MPL.faint, fontWeight: 700 }}>Activos:</span>
                {activeFilters.map(filter => (
                  <span key={String(filter)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: MPL.teal100, color: MPL.tealDark, fontSize: 13, fontWeight: 700, padding: '6px 13px', borderRadius: 999 }}>
                    {filter}
                    <X size={13} />
                  </span>
                ))}
                {isFetching && <span style={{ fontSize: 13, color: MPL.faint }}>Actualizando...</span>}
                <button type="button" onClick={saveAlert} disabled={alertMutation.isPending} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, border: `1.5px solid ${MPL.teal}`, background: '#fff', color: MPL.teal, borderRadius: 12, padding: '8px 12px', font: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  <Bell size={15} />
                  {alertMutation.isPending ? 'Guardando...' : 'Crear alerta'}
                </button>
              </div>
            )}

            {isLoading ? (
              <SkeletonGrid />
            ) : (data as any)?.error ? (
              <ErrorCard message={(data as any)?.error || 'No se pudo cargar el listado'} />
            ) : items.length === 0 ? (
              <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, padding: 28, color: MPL.muted }}>
                No encontramos animales con esos filtros.
              </div>
            ) : (
              <>
                <div className="catalog-results">
                  {items.map((a: any) => {
                    const id = String(a._id || a.id);
                    const image = Array.isArray(a.images) ? a.images[0] : null;
                    const personality = Array.isArray(a.personality) ? a.personality.slice(0, 2) : [];
                    const meta = [speciesLabel(a.species), sizeLabel(a.size), a.age, a.city].filter(Boolean).join(' · ');
                    const favorite = favorites.isFavorite(id);
                    return (
                      <article key={id} className="catalog-card" style={{ position: 'relative', background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 3px rgba(31,55,40,.06),0 8px 24px -16px rgba(31,55,40,.18)' }}>
                        <Link to={`/animals/${id}`} style={{ display: 'block', textDecoration: 'none', color: MPL.ink }}>
                          <div style={{ height: 200, background: '#E6E0D2', position: 'relative', overflow: 'hidden' }}>
                            {image ? (
                              <img src={toAbsoluteUrl(image)} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MPL.faint, fontSize: 13 }}>Sin imagen</div>
                            )}
                            <span style={{ position: 'absolute', top: 12, left: 12, background: a.status === 'publicado' ? MPL.teal100 : MPL.gold100, color: a.status === 'publicado' ? MPL.tealDark : MPL.goldDark, fontSize: 11.5, fontWeight: 800, padding: '5px 11px', borderRadius: 8 }}>
                              {a.status === 'publicado' ? 'Disponible' : statusLabel(a.status)}
                            </span>
                          </div>
                          <div style={{ padding: '16px 18px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                              <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 21, fontWeight: 800 }}>{a.name}</span>
                              {a.code && <span style={{ fontSize: 12, color: MPL.olive, fontWeight: 800 }}>{a.code}</span>}
                            </div>
                            <div style={{ fontSize: 13, color: MPL.muted, margin: '4px 0 12px' }}>{meta || 'Información pendiente'}</div>
                            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                              {(personality.length ? personality : ['Sociable']).map((trait: string) => (
                                <span key={trait} style={{ background: MPL.bg, color: MPL.muted, fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999 }}>
                                  {trait}
                                </span>
                              ))}
                            </div>
                          </div>
                        </Link>
                        <button
                          type="button"
                          aria-label={favorite ? `Quitar ${a.name} de favoritos` : `Añadir ${a.name} a favoritos`}
                          title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                          onClick={() => favorites.toggle(id)}
                          disabled={favorites.isPending(id)}
                          style={{ position: 'absolute', top: 12, right: 12, width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 13, border: 0, background: 'rgba(255,255,255,.94)', color: favorite ? MPL.coral : MPL.muted, boxShadow: '0 6px 18px -8px rgba(31,55,40,.4)', cursor: 'pointer' }}
                        >
                          <Heart size={20} fill={favorite ? 'currentColor' : 'none'} />
                        </button>
                      </article>
                    );
                  })}
                </div>

                <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 32 }} aria-label="Paginación">
                  <button type="button" onClick={() => setFilterPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Página anterior" style={{ width: 40, height: 40, borderRadius: 12, background: '#fff', border: `1px solid ${MPL.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MPL.muted, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? .5 : 1 }}>
                    <ChevronLeft size={17} />
                  </button>
                  {Array.from({ length: Math.min(3, pages) }, (_, i) => i + 1).map(n => (
                    <button key={n} type="button" onClick={() => setFilterPage(n)} style={{ width: 40, height: 40, borderRadius: 12, background: page === n ? MPL.teal : '#fff', color: page === n ? '#fff' : MPL.muted, border: page === n ? `1px solid ${MPL.teal}` : `1px solid ${MPL.border}`, fontWeight: 800, cursor: 'pointer' }}>
                      {n}
                    </button>
                  ))}
                  <button type="button" onClick={() => setFilterPage(Math.min(pages, page + 1))} disabled={page >= pages} aria-label="Página siguiente" style={{ width: 40, height: 40, borderRadius: 12, background: '#fff', border: `1px solid ${MPL.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MPL.muted, cursor: page >= pages ? 'not-allowed' : 'pointer', opacity: page >= pages ? .5 : 1 }}>
                    <ChevronRight size={17} />
                  </button>
                </nav>
              </>
            )}
          </section>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
