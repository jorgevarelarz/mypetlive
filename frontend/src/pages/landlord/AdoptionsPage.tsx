import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listAllAdoptionsForMyAnimals,
  setAdoptionStatus,
  ADOPTION_STATUS_LABEL,
  AdoptionShelterStatus,
} from '../../api/adoptions';
import { speciesLabel, statusLabel } from '../../styles/mypetlive';
import { toast } from 'react-hot-toast';

// Transiciones que ofrece el panel según el estado actual de la solicitud (dossier p.9).
// `setStatus` del backend NO valida transiciones: acepta cualquier estado del enum, así que
// este mapa es la única barrera. Por eso los estados terminales quedan vacíos: aprobar
// traspasa el animal al adoptante (ownerId + isPersonalPet + plan de bienvenida) y el
// backend no lo revierte, de modo que ofrecer "rechazar" tras aprobar dejaría datos incoherentes.
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
  recibida: '#8A6D1F',
  cuestionario_pendiente: '#8A6D1F',
  en_revision: '#8A6D1F',
  info_adicional: '#B4552F',
  cita_propuesta: '#B4552F',
  preaprobada: '#2B6CB0',
  aprobada: '#2F855A',
  rechazada: '#C53030',
  cancelada: '#718096',
};

// Por qué se cerró el proceso: "cerrado" a secas no dice si el animal sigue disponible.
const CLOSED_NOTE: Record<string, string> = {
  aprobada: 'Adopción cerrada · el animal ya es del adoptante',
  rechazada: 'Rechazada · el animal vuelve a estar disponible',
  cancelada: 'Cancelada · el animal vuelve a estar disponible',
};

const OPEN_STATES = ['recibida', 'cuestionario_pendiente', 'en_revision', 'info_adicional', 'cita_propuesta', 'preaprobada'];

const FILTERS = [
  { key: 'abiertas', label: 'Abiertas' },
  { key: 'todas', label: 'Todas' },
  { key: 'aprobadas', label: 'Aprobadas' },
  { key: 'cerradas', label: 'Rechazadas / canceladas' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

// El backend recorta la nota a 1000 caracteres con zod y devuelve 400 si se pasa:
// la cortamos aquí para que un texto largo no tire la transición entera.
const NOTE_MAX = 1000;

export default function AdoptionsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['adoptions-for-my-animals'],
    queryFn: () => listAllAdoptionsForMyAnimals(),
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('abiertas');

  const onTransition = async (id: string, status: AdoptionShelterStatus, animalName?: string) => {
    let note: string | undefined;
    if (status === 'info_adicional' || status === 'rechazada') {
      const raw = window.prompt(
        status === 'rechazada' ? 'Motivo del rechazo (opcional):' : '¿Qué información necesitas del adoptante?',
      );
      // Cancelar el diálogo aborta la transición: antes seguía adelante y el adoptante
      // recibía un "necesitamos más información" sin decirle cuál.
      if (raw === null) return;
      const trimmed = raw.trim();
      if (status === 'info_adicional' && !trimmed) {
        toast.error('Indica qué información necesitas: el adoptante ve esta nota.');
        return;
      }
      note = trimmed ? trimmed.slice(0, NOTE_MAX) : undefined;
    }
    // Aprobar es irreversible: traspasa el animal al adoptante y el backend no lo deshace.
    if (
      status === 'aprobada' &&
      !window.confirm(
        `¿Aprobar la adopción de ${animalName || 'este animal'}?\n\n` +
          'La ficha pasa a ser del adoptante y el proceso se cierra: no se puede deshacer desde el panel.',
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      await setAdoptionStatus(id, status, note);
      toast.success('Estado actualizado');
      refetch();
      // Aprobar / rechazar / preaprobar también mueve el estado del animal (reservado,
      // adoptado o de vuelta a publicado): el dashboard y sus métricas quedan obsoletos.
      queryClient.invalidateQueries({ queryKey: ['shelter-adoptions'] });
      queryClient.invalidateQueries({ queryKey: ['shelter-animals'] });
      queryClient.invalidateQueries({ queryKey: ['shelter-animal-counts'] });
      queryClient.invalidateQueries({ queryKey: ['shelter-metrics'] });
    } catch (e: any) {
      const payload = e?.response?.data;
      toast.error(payload?.error || payload?.message || 'No se pudo actualizar');
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
        {/* El cambio de estado tiene efectos sobre la ficha del animal: mejor decirlo antes. */}
        <p className="text-xs text-gray-500 mt-1">
          Al proponer cita o preaprobar, el animal pasa a «reservado» y deja de aceptar nuevas solicitudes. Si
          rechazas o cancelas, vuelve a estar publicado. Al aprobar, la ficha pasa al adoptante de forma definitiva.
        </p>
      </div>

      {isError ? (
        // Antes un fallo de red se pintaba como "No hay solicitudes": una protectora podía
        // creer que nadie la había solicitado.
        <div className="border rounded-2xl p-4" style={{ borderColor: '#FEB2B2', background: '#FFF5F5' }}>
          <div className="font-semibold" style={{ color: '#C53030' }}>
            No hemos podido cargar tus solicitudes
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {(error as any)?.response?.data?.error || (error as any)?.message || 'Error de conexión.'}
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="mt-3 px-3 py-1.5 rounded border text-sm font-semibold disabled:opacity-50"
            style={{ borderColor: '#FEB2B2', color: '#C53030', background: '#fff' }}
          >
            {isFetching ? 'Reintentando…' : 'Reintentar'}
          </button>
        </div>
      ) : (
        <>
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
                {/* Sin datos cargados no hay contador que mostrar: un "(0)" durante la carga
                    se lee como dato real. */}
                {f.label}{isLoading ? '' : ` (${counts[f.key]})`}
              </button>
            ))}
          </div>

          {data?.truncated && (
            <div className="text-xs" style={{ color: '#8A6D1F' }}>
              Mostrando las {allItems.length} solicitudes más recientes de {data.total}. Los contadores solo cuentan
              las cargadas.
            </div>
          )}

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
                        {/* `species` y `status` llegan crudos del modelo (gato, no_disponible…). */}
                        {it.animal?.species && (
                          <span className="text-xs text-gray-500">{speciesLabel(it.animal.species)}</span>
                        )}
                        {it.animal?.status && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: '#F3F0E8', color: '#3F4A3C' }}
                          >
                            {statusLabel(it.animal.status)}
                          </span>
                        )}
                        <Link to={`/adoptions/${id}`} className="text-xs font-semibold" style={{ color: '#1F6F6F' }}>
                          Ver detalle →
                        </Link>
                      </div>
                      <div className="text-sm text-gray-600">
                        {it.adopter?.name || 'Adoptante'}
                        {it.adopter?.email ? ` · ${it.adopter.email}` : ''}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-xs uppercase tracking-wide font-semibold"
                          style={{ color: STATUS_TONE[it.status] || '#6B7280' }}
                        >
                          {ADOPTION_STATUS_LABEL[it.status as keyof typeof ADOPTION_STATUS_LABEL] || it.status}
                        </span>
                        {it.createdAt && (
                          <span className="text-xs text-gray-500">
                            solicitada el {new Date(it.createdAt).toLocaleDateString('es-ES')}
                          </span>
                        )}
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
                        <span className="text-xs text-gray-400 md:text-right">
                          {CLOSED_NOTE[it.status] || 'Proceso cerrado'}
                        </span>
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
        </>
      )}
    </div>
  );
}
