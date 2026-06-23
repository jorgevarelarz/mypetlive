import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAdoption, setAdoptionStatus, ADOPTION_STATUS_LABEL, AdoptionShelterStatus } from '../../api/adoptions';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

const MANAGE_ACTIONS: AdoptionShelterStatus[] = ['en_revision', 'cita_propuesta', 'preaprobada', 'aprobada', 'rechazada'];

export default function AdoptionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['adoption', id], queryFn: ()=> getAdoption(id||''), enabled: !!id });
  if (isLoading || !data) return <div className="p-4">Cargando…</div>;
  const a: any = data;
  const canManage = user?.role === 'landlord' || user?.role === 'admin';
  const decide = async (st: AdoptionShelterStatus) => {
    try { await setAdoptionStatus(String(id), st); toast.success('Estado actualizado'); refetch(); } catch { toast.error('Error actualizando'); }
  };
  return (
    <div className="p-4 grid gap-2">
      <h1 className="text-xl font-semibold">Solicitud de adopción</h1>
      <div className="text-sm text-gray-700">ID: {a._id || a.id}</div>
      <div className="text-sm text-gray-700">Estado: {ADOPTION_STATUS_LABEL[a.status as keyof typeof ADOPTION_STATUS_LABEL] || a.status}</div>
      {a.animal && (
        <div className="mt-2 border rounded p-2">
          <div className="font-medium">{a.animal.name}</div>
          <div className="text-sm text-gray-600">{a.animal.species}{a.animal.breed?` · ${a.animal.breed}`:''}</div>
          <div className="text-xs text-gray-500">{a.animal.sex} · {a.animal.size}</div>
        </div>
      )}
      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          {MANAGE_ACTIONS.map((st) => (
            <button key={st} className="px-3 py-1 border rounded text-sm" onClick={()=>decide(st)}>
              {ADOPTION_STATUS_LABEL[st]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

