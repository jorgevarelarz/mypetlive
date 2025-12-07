import React from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { searchAnimals } from '../../api/animals';
import SkeletonGrid from '../../components/ui/SkeletonGrid';
import ErrorCard from '../../components/ui/ErrorCard';
import EmptyState from '../../components/ui/EmptyState';

export default function AnimalsList() {
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') || '1');
  const limit = Number(sp.get('limit') || '12');
  const q = sp.get('q') || undefined;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['animals', { q, page, limit }],
    queryFn: () => searchAnimals({ q, page, limit }),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));

  return (
    <div style={{ padding: '24px', display: 'grid', gap: 16 }}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Animales</h2>
        <div className="text-sm text-gray-600">{isFetching ? 'Actualizando…' : null}</div>
      </div>
      <div className="flex gap-2">
        <input
          className="border border-gray-300 rounded px-3 py-1.5 w-full max-w-sm"
          placeholder="Buscar por nombre, especie, raza…"
          defaultValue={q || ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = (e.target as HTMLInputElement).value;
              const next = new URLSearchParams(sp);
              if (v) next.set('q', v); else next.delete('q');
              next.set('page', '1');
              setSp(next, { replace: false });
            }
          }}
        />
      </div>
      {isLoading ? (
        <SkeletonGrid />
      ) : (data as any)?.error ? (
        <ErrorCard message={(data as any)?.error || 'No se pudo cargar el listado'} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No encontramos animales con esos filtros"
          detail="Prueba a quitar filtros o cambiar la búsqueda."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {items.map((a: any) => (
              <Link key={a._id || a.id} to={`/animals/${a._id || a.id}`} className="border border-gray-200 rounded hover:shadow-sm">
                <div className="aspect-video bg-gray-100 overflow-hidden rounded-t">
                  {Array.isArray(a.images) && a.images[0] ? (
                    <img src={a.images[0]} alt={a.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">Sin imagen</div>
                  )}
                </div>
                <div className="p-3 grid gap-1">
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-sm text-gray-600">{a.species}{a.breed ? ` · ${a.breed}` : ''}</div>
                  <div className="text-xs text-gray-500">{a.sex} · {a.size} · {a.status}</div>
                </div>
              </Link>
            ))}
          </div>
          <nav className="flex items-center justify-center gap-2 mt-3" aria-label="Paginación">
            <button
              className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-50"
              onClick={() => setSp({ q: q || '', page: String(Math.max(1, page - 1)), limit: String(limit) })}
              disabled={page <= 1}
            >Anterior</button>
            <span className="text-sm text-gray-700">Página {page} / {pages}</span>
            <button
              className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-50"
              onClick={() => setSp({ q: q || '', page: String(Math.min(pages, page + 1)), limit: String(limit) })}
              disabled={page >= pages}
            >Siguiente</button>
          </nav>
        </>
      )}
    </div>
  );
}

