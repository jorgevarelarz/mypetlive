import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAdoptionsForMyAnimals, setAdoptionStatus } from '../../api/adoptions';
import { toast } from 'react-hot-toast';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
};

export default function AdoptionsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['adoptions-for-my-animals'],
    queryFn: () => listAdoptionsForMyAnimals({ page: 1, limit: 100 }),
  });
  const onDecision = async (id: string, status: 'accepted' | 'rejected') => {
    try {
      await setAdoptionStatus(id, status);
      toast.success('Estado actualizado');
      refetch();
    } catch (e: any) {
      toast.error('No se pudo actualizar');
    }
  };
  const items = data?.items || [];
  return (
    <div className="p-4 grid gap-4">
      <div>
        <h1 className="text-xl font-semibold">Solicitudes de adopción</h1>
        <p className="text-sm text-gray-600">Revisa las solicitudes pendientes y responde con un clic.</p>
      </div>
      {isLoading ? (
        <div>Cargando…</div>
      ) : items.length === 0 ? (
        <div className="text-gray-600">No hay solicitudes.</div>
      ) : (
        <div className="grid gap-3">
          {items.map((it: any) => (
            <div key={it.id || it._id} className="border rounded-2xl p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
              <div className="grid gap-2 flex-1">
                <div className="font-semibold text-lg">{it.animal?.name || 'Animal'}</div>
                <div className="text-sm text-gray-600">{it.adopter?.name || 'Adoptante'}{it.adopter?.email ? ` · ${it.adopter.email}` : ''}</div>
                <div className="text-xs uppercase tracking-wide text-gray-500">{STATUS_LABEL[it.status] || it.status}</div>
                {Array.isArray(it.answers) && it.answers.length > 0 && (
                  <div className="mt-1">
                    <div className="text-sm font-semibold" style={{ color: '#3F4A3C' }}>Respuestas del cuestionario</div>
                    <ul className="mt-1 space-y-1 text-sm text-gray-700">
                      {it.answers.map((ans: any, idx: number) => (
                        <li key={idx}>
                          <span className="font-medium">{ans.question}:</span> {ans.answer || '—'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 rounded border" onClick={() => onDecision(it.id || it._id, 'accepted')}>
                  Aceptar
                </button>
                <button className="px-3 py-1.5 rounded border" onClick={() => onDecision(it.id || it._id, 'rejected')}>
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
