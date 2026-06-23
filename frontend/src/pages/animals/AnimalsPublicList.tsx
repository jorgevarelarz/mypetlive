import React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { searchAnimals } from '../../api/animals';
import SkeletonGrid from '../../components/ui/SkeletonGrid';
import ErrorCard from '../../components/ui/ErrorCard';
import { toAbsoluteUrl } from '../../utils/media';
import { BrandWordmark, MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, sizeLabel, speciesLabel } from '../../styles/mypetlive';

const speciesOptions = [
  { label: 'Perro', value: 'dog' },
  { label: 'Gato', value: 'cat' },
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
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') || '1');
  const limit = Number(sp.get('limit') || '12');
  const q = sp.get('q') || undefined;
  const species = sp.get('species') || undefined;
  const size = (sp.get('size') as 'small' | 'medium' | 'large' | null) || undefined;
  const sex = (sp.get('sex') as 'male' | 'female' | null) || undefined;

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
    queryKey: ['animals-public', { q, species, size, sex, page, limit }],
    queryFn: () => searchAnimals({ q, species, size, sex, page, limit }),
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
  ].filter(Boolean);

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, background: MPL.bg, color: MPL.ink, minHeight: '100vh' }}>
      <style>{`
        .catalog-link{color:inherit;text-decoration:none;}
        .catalog-link:hover{color:${MPL.teal};}
        .catalog-card{transition:transform .18s ease, box-shadow .18s ease;}
        .catalog-card:hover{transform:translateY(-4px);box-shadow:0 1px 3px rgba(31,55,40,.06),0 22px 44px -24px rgba(31,55,40,.32) !important;}
        .catalog-grid{display:grid;grid-template-columns:260px minmax(0,1fr);gap:28px;}
        .catalog-results{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;}
        @media (max-width: 980px){.catalog-grid{grid-template-columns:1fr}.catalog-aside{position:static!important}.catalog-results{grid-template-columns:repeat(2,minmax(0,1fr));}}
        @media (max-width: 640px){.catalog-results{grid-template-columns:1fr}.catalog-top{padding:18px 16px!important}.catalog-hero{padding:28px 16px 20px!important}.catalog-search{flex-direction:column;align-items:stretch!important}.catalog-nav{display:none!important}}
      `}</style>

      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(246,243,236,.88)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${MPL.border}` }}>
        <div className="catalog-top" style={{ maxWidth: 1180, margin: '0 auto', padding: '15px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
          <Link to="/" className="catalog-link">
            <BrandWordmark />
          </Link>
          <nav className="catalog-nav" style={{ display: 'flex', gap: 28, fontSize: 14.5, fontWeight: 700, color: MPL.muted, alignItems: 'center' }}>
            <Link className="catalog-link" to="/animals" style={{ color: MPL.teal }}>Adoptar</Link>
            <Link className="catalog-link" to="/#como">Cómo funciona</Link>
            <Link className="catalog-link" to="/#impacto">Impacto</Link>
            <Link className="catalog-link" to="/landlord">Protectoras</Link>
          </nav>
          <Link to="/animals" style={{ background: MPL.coral, color: '#fff', fontSize: 14.5, fontWeight: 800, padding: '11px 22px', borderRadius: 14, textDecoration: 'none' }}>
            Adoptar
          </Link>
        </div>
      </div>

      <main style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header className="catalog-hero" style={{ padding: '42px 32px 28px' }}>
          <div style={{ fontSize: 13, color: MPL.faint, fontWeight: 700, marginBottom: 8 }}>
            <Link to="/" className="catalog-link">Inicio</Link> / Catálogo
          </div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 40, fontWeight: 800, margin: '0 0 6px' }}>
            Animales en adopción
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 14, padding: '13px 18px', fontSize: 14.5, fontWeight: 700 }}>
              <SlidersHorizontal size={17} color={MPL.teal} />
              Más recientes
            </div>
          </div>
        </header>

        <div className="catalog-grid" style={{ padding: '0 32px 56px' }}>
          <aside className="catalog-aside" style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, padding: 24, position: 'sticky', top: 90, alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, fontWeight: 800 }}>Filtros</span>
              {activeFilters.length > 0 && (
                <button type="button" onClick={clearFilters} style={{ border: 0, background: 'none', color: MPL.coral, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  Limpiar
                </button>
              )}
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

            <div style={{ borderTop: `1px solid ${MPL.bg}`, paddingTop: 20 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: MPL.faint, fontWeight: 800, marginBottom: 11 }}>Sexo</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {sexOptions.map(option => (
                  <Chip key={option.value} active={sex === option.value} onClick={() => setFilter('sex', sex === option.value ? '' : option.value)}>
                    {option.label}
                  </Chip>
                ))}
              </div>
            </div>
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
                    const image = Array.isArray(a.images) ? a.images[0] : null;
                    const personality = Array.isArray(a.personality) ? a.personality.slice(0, 2) : [];
                    const meta = [speciesLabel(a.species), sizeLabel(a.size), a.age].filter(Boolean).join(' · ');
                    return (
                      <Link key={a._id || a.id} className="catalog-card" to={`/animals/${a._id || a.id}`} style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 3px rgba(31,55,40,.06),0 8px 24px -16px rgba(31,55,40,.18)', display: 'block', textDecoration: 'none', color: MPL.ink }}>
                        <div style={{ height: 200, background: '#E6E0D2', position: 'relative', overflow: 'hidden' }}>
                          {image ? (
                            <img src={toAbsoluteUrl(image)} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MPL.faint, fontSize: 13 }}>Sin imagen</div>
                          )}
                          <span style={{ position: 'absolute', top: 12, left: 12, background: MPL.teal100, color: MPL.tealDark, fontSize: 11.5, fontWeight: 800, padding: '5px 11px', borderRadius: 8 }}>
                            Publicado
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
    </div>
  );
}
