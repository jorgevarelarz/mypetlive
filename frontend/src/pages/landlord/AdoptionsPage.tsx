import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  listAdoptionsForMyAnimals,
  setAdoptionStatus,
  ADOPTION_STATUS_LABEL,
  AdoptionShelterStatus,
} from '../../api/adoptions';
import { toast } from 'react-hot-toast';

// Transiciones que ofrece el panel según el estado actual de la solicitud (dossier p.9).
const NEXT_ACTIONS: Record<string, AdoptionShelterStatus[]> = {
  recibida: ['en_revision', 'info_adicional', 'rechazada'],
  cuestionario_pendiente: ['en_revision', 'info_adicional', 'rechazada'],
  en_revision: ['cita_propuesta', 'info_adicional', 'preaprobada', 'rechazada'],
  info_adicional: ['en_revision', 'cita_propuesta', 'rechazada'],
  cita_propuesta: ['preaprobada', 'rechazada', 'cancelada'],
  preaprobada: ['aprobada', 'rechazada', 'cancelada'],
  aprobada: [],
  rechazada: [],
  cancelada: [],
};

// Los botones son acciones, no estados: "Rechazar", no "Rechazada".
const ACTION_LABEL: Record<AdoptionShelterStatus, string> = {
  en_revision: 'Pasar a revisión',
  info_adicional: 'Pedir información',
  cita_propuesta: 'Proponer cita',
  preaprobada: 'Preaprobar',
  aprobada: 'Aprobar adopción',
  rechazada: 'Rechazar',
  cancelada: 'Cancelar proceso',
};

const STATUS_TONE: Record<string, string> = {
  aprobada: '#2F855A',
  rechazada: '#C53030',
  cancelada: '#718096',
  preaprobada: '#2B6CB0',
};

const OPEN_STATES = ['recibida', 'cuestionario_pendiente', 'en_revision', 'info_adicional', 'cita_propuesta', 'preaprobada'];

const FILTERS = [
  { key: 'abiertas', label: 'Abiertas' },
  { key: 'todas', label: 'Todas' },
  { key: 'aprobadas', label: 'Aprobadas' },
  { key: 'cerradas', label: 'Rechazadas / canceladas' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

export default function AdoptionsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['adoptions-for-my-animals'],
    queryFn: () => listAdoptionsForMyAnimals({ page: 1, limit: 100 }),
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('abiertas');

  const onTransition = async (id: string, status: AdoptionShelterStatus, animalName?: string) => {
    let note: string | undefined;
    if (status === 'info_adicional' || status === 'rechazada') {
      note = window.prompt(
        status === 'rechazada' ? 'Motivo del rechazo (opcional):' : '¿Qué información necesitas del adoptante?',
      ) || undefined;
    }
    // Aprobar cierra el proceso (y descarta al resto de candidatos): confirmación explícita.
    if (status === 'aprobada' && !window.confirm(`¿Aprobar la adopción de ${animalName || 'este animal'}? Esta acción cierra el proceso.`)) {
      return;
    }
    setBusyId(id);
    try {
      await setAdoptionStatus(id, status, note);
      toast.success('Estado actualizado');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo actualizar');
    } finally {
      setBusyId(null);
    }
  };

  const allItems = useMemo(() => data?.items || [], [data?.items]);
  const counts = useMemo(() => ({
    abiertas: allItems.filter((it: any) => OPEN_STATES.includes(it.status)).length,
    todas: allItems.length,
    aprobadas: allItems.filter((it: any) => it.status === 'aprobada').length,
    cerradas: allItems.filter((it: any) => ['rechazada', 'cancelada'].includes(it.status)).length,
  }), [allItems]);
  const items = useMemo(() => {
    if (filter === 'todas') return allItems;
    if (filter === 'aprobadas') return allItems.filter((it: any) => it.status === 'aprobada');
    if (filter === 'cerradas') return allItems.filter((it: any) => ['rechazada', 'cancelada'].includes(it.status));
    return allItems.filter((it: any) => OPEN_STATES.includes(it.status));
  }, [allItems, filter]);

  return (
    <div className="p-4 grid gap-4">
      <div>
        <h1 className="text-xl font-semibold">Solicitudes de adopción</h1>
        <p className="text-sm text-gray-600">
          Gestiona cada solicitud por estados: revisión, información adicional, cita, preaprobación y aprobación final.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className="px-3 py-1.5 rounded-full border text-sm font-semibold"
            style={filter === f.key
              ? { background: '#1F6F6F', color: '#fff', borderColor: '#1F6F6F' }
              : { background: '#fff', color: '#3F4A3C', borderColor: '#E7E1D5' }}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div>Cargando…</div>
      ) : items.length === 0 ? (
        <div className="text-gray-600">
          {filter === 'abiertas' && counts.todas > 0
            ? 'No tienes solicitudes abiertas ahora mismo. Mira "Todas" para ver el histórico.'
            : 'No hay solicitudes.'}
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((it: any) => {
            const id = it.id || it._id;
            const actions = NEXT_ACTIONS[it.status] || [];
            return (
              <div
                key={id}
                className="border rounded-2xl p-3 flex flex-col md:flex-row md:items-start md:justify-between gap-3"
                style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}
              >
                <div className="grid gap-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-lg">{it.animal?.name || 'Animal'}</span>
                    {it.animal?.code && <span className="text-xs text-gray-500">#{it.animal.code}</span>}
                    <Link to={`/adoptions/${id}`} className="text-xs font-semibold" style={{ color: '#1F6F6F' }}>
                      Ver detalle →
                    </Link>
                  </div>
                  <div className="text-sm text-gray-600">
                    {it.adopter?.name || 'Adoptante'}
                    {it.adopter?.email ? ` · ${it.adopter.email}` : ''}
                  </div>
                  <div
                    className="text-xs uppercase tracking-wide font-semibold"
                    style={{ color: STATUS_TONE[it.status] || '#6B7280' }}
                  >
                    {ADOPTION_STATUS_LABEL[it.status as keyof typeof ADOPTION_STATUS_LABEL] || it.status}
                  </div>
                  {Array.isArray(it.answers) && it.answers.length > 0 && (
                    <div className="mt-1">
                      <div className="text-sm font-semibold" style={{ color: '#3F4A3C' }}>
                        Respuestas del cuestionario
                      </div>
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
                <div className="flex flex-wrap gap-2 md:justify-end md:max-w-[300px]">
                  {actions.length === 0 ? (
                    <span className="text-xs text-gray-400">Proceso cerrado</span>
                  ) : (
                    actions.map((action) => (
                      <button
                        key={action}
                        disabled={busyId === id}
                        className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
                        style={
                          action === 'aprobada'
                            ? { background: '#2F855A', color: '#fff', borderColor: '#2F855A' }
                            : action === 'rechazada'
                            ? { color: '#C53030', borderColor: '#FEB2B2' }
                            : { borderColor: '#E7E1D5' }
                        }
                        onClick={() => onTransition(id, action, it.animal?.name)}
                      >
                        {ACTION_LABEL[action]}
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
