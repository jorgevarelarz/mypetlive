import React from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { searchAnimals } from '../../api/animals';
import SkeletonGrid from '../../components/ui/SkeletonGrid';
import ErrorCard from '../../components/ui/ErrorCard';
import { toAbsoluteUrl } from '../../utils/media';

export default function AnimalsPublicList() {
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') || '1');
  const limit = Number(sp.get('limit') || '12');
  const q = sp.get('q') || undefined;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['animals-public', { q, page, limit }],
    queryFn: () => searchAnimals({ q, page, limit }),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));

  return (
    <div style={{ background: '#F6F3EC', minHeight: '100vh', padding: '32px 16px' }}>
      <div className="mx-auto max-w-6xl grid gap-4" style={{ color: '#3F4A3C' }}>
        <header className="grid gap-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-3xl font-semibold">Animales en adopción</h1>
            <span className="text-sm" style={{ color: '#7A8273' }}>{isFetching ? 'Actualizando…' : null}</span>
          </div>
          <p className="text-sm" style={{ color: '#7A8273' }}>Encuentra a tu próximo compañero.</p>
          <div className="flex gap-2">
            <input
              className="border rounded px-3 py-2 w-full max-w-md"
              style={{ borderColor: '#E7E1D5' }}
              placeholder="Buscar por nombre, especie, raza…"
              defaultValue={q || ''}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value;
                  const next = new URLSearchParams(sp);
                  if (v) next.set('q', v);
                  else next.delete('q');
                  next.set('page', '1');
                  setSp(next, { replace: false });
                }
              }}
            />
          </div>
        </header>

        {isLoading ? (
          <SkeletonGrid />
        ) : (data as any)?.error ? (
          <ErrorCard message={(data as any)?.error || 'No se pudo cargar el listado'} />
        ) : items.length === 0 ? (
          <div className="text-sm" style={{ color: '#7A8273' }}>No encontramos animales con esos filtros.</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((a: any) => {
                const image = Array.isArray(a.images) ? a.images[0] : null;
                const personality = Array.isArray(a.personality) ? a.personality.slice(0, 3) : [];
                return (
                  <div key={a._id || a.id} className="rounded-2xl border overflow-hidden flex flex-col" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
                    <div className="aspect-video bg-[#F1ECE4]">
                      {image ? (
                        <img src={toAbsoluteUrl(image)} alt={a.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: '#7A8273' }}>Sin imagen</div>
                      )}
                    </div>
                    <div className="p-4 grid gap-2 flex-1">
                      <div>
                        <h4 className="text-lg font-semibold flex items-center gap-2">
                          {a.name}
                          {a.code && (
                            <span className="text-xs font-semibold tracking-wide" style={{ color: '#6A7B4F' }}>{a.code}</span>
                          )}
                        </h4>
                        <p className="text-sm" style={{ color: '#7A8273' }}>
                          {a.species}{a.age ? ` · ${a.age}` : ''}
                        </p>
                      </div>
                      {personality.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {personality.map((trait: string) => (
                            <span key={trait} className="text-xs px-3 py-1 rounded-full border" style={{ borderColor: '#E7E1D5', color: '#3F4A3C' }}>
                              {trait}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-auto">
                        <Link to={`/animals/${a._id || a.id}`} className="text-sm" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>
                          Ver detalles ›
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <nav className="flex items-center justify-center gap-2 mt-4" aria-label="Paginación">
              <button className="px-3 py-1.5 rounded border" style={{ borderColor: '#E7E1D5' }} onClick={() => setSp({ q: q || '', page: String(Math.max(1, page - 1)), limit: String(limit) })} disabled={page <= 1}>
                Anterior
              </button>
              <span className="text-sm" style={{ color: '#7A8273' }}>Página {page} / {pages}</span>
              <button className="px-3 py-1.5 rounded border" style={{ borderColor: '#E7E1D5' }} onClick={() => setSp({ q: q || '', page: String(Math.min(pages, page + 1)), limit: String(limit) })} disabled={page >= pages}>
                Siguiente
              </button>
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
