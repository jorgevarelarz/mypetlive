import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { listMyAdoptions, ADOPTION_STATUS_LABEL } from '../../api/adoptions';
import { Link } from 'react-router-dom';

export default function MyAdoptions() {
  const { data, isLoading } = useQuery({ queryKey: ['my-adoptions'], queryFn: listMyAdoptions });
  if (isLoading) return <div className="p-4">Cargando…</div>;
  const items = data?.items || [];
  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-3">Mis solicitudes de adopción</h2>
      {items.length === 0 ? (
        <div className="text-gray-600">Aún no tienes solicitudes.</div>
      ) : (
        <ul className="divide-y">
          {items.map((it: any) => (
            <li key={it.id} className="py-2 grid gap-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{it.animal?.name || 'Animal'}</div>
                  <div className="text-sm text-gray-600">{it.animal?.species}{it.animal?.breed ? ` · ${it.animal.breed}` : ''}</div>
                </div>
                <div className="text-sm text-gray-700">Estado: {ADOPTION_STATUS_LABEL[it.status as keyof typeof ADOPTION_STATUS_LABEL] || it.status}</div>
              </div>
              <div className="flex gap-3">
                <Link to={`/animals/${it.animal?._id || it.animal?.id || ''}`} className="text-emerald-700 hover:underline text-sm">Ver animal</Link>
                <Link to={`/adoptions/${it.id}`} className="text-emerald-700 hover:underline text-sm">Ver solicitud</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
