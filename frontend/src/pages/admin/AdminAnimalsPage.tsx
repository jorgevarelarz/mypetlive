import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchAnimals } from '../../api/animals';

export default function AdminAnimalsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-animals'], queryFn: () => searchAnimals({ limit: 200, page: 1, sort: 'createdAt', dir: 'desc' }) });
  const items = data?.items || [];
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Animales</h1>
      {isLoading ? <div>Cargando…</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((a: any) => (
            <div key={a._id || a.id} className="border rounded overflow-hidden">
              <div className="aspect-video bg-gray-100">
                {Array.isArray(a.images) && a.images[0] ? <img src={a.images[0]} alt={a.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400">Sin imagen</div>}
              </div>
              <div className="p-2 grid gap-1">
                <div className="font-medium">{a.name}</div>
                <div className="text-sm text-gray-600">{a.species}{a.breed?` · ${a.breed}`:''}</div>
                <div className="text-xs text-gray-500">{a.sex} · {a.size} · {a.status}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

