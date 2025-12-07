import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminListAdoptions } from '../../api/adoptions';

export default function AdminAdoptionsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-adoptions'], queryFn: () => adminListAdoptions({ page: 1, limit: 200 }) });
  const items = data?.items || [];
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Adopciones</h1>
      {isLoading ? <div>Cargando…</div> : items.length === 0 ? <div className="text-gray-600">Sin datos</div> : (
        <table className="min-w-full text-sm border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Animal</th>
              <th className="p-2 text-left">Adoptante</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Creado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any) => (
              <tr key={it._id || it.id} className="border-t">
                <td className="p-2">{it._id || it.id}</td>
                <td className="p-2">{it.animalId}</td>
                <td className="p-2">{it.adopterId}</td>
                <td className="p-2">{it.status}</td>
                <td className="p-2">{new Date(it.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

