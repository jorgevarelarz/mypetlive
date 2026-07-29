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
import { nextAdoptionStatuses, ADOPTION_ACTION_LABEL as ACTION_LABEL } from '../../utils/adoptionTransitions';

const STATUS_TONE: Record<string, string> = {
  aprobada: '#2F855A',
  rechazada: '#C53030',
  cancelada: '#718096',
  preaprobada: '#2B6CB0',
};

const OPEN_STATES = ['recibida', 'cuestionario_pendiente', 'en_revision', 'info_adicional', 'cita_propuesta', 'preaprobada'];

// Tope que impone `adoptionStatusSchema` en el servidor (`note: z.string().max(1000)`).
const NOTE_MAX_LENGTH = 1000;

const FILTERS = [
  { key: 'abiertas', label: 'Abiertas' },
  { key: 'todas', label: 'Todas' },
  { key: 'aprobadas', label: 'Aprobadas' },
  { key: 'cerradas', label: 'Rechazadas / canceladas' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

export default function AdoptionsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['adoptions-for-my-animals'],
    queryFn: () => listAllAdoptionsForMyAnimals(),
  });
  const [busy, setBusy] = useState<{ id: string; status: AdoptionShelterStatus } | null>(null);
  const [filter, setFilter] = useState<FilterKey>('abiertas');

  const onTransition = async (id: string, status: AdoptionShelterStatus, animalName?: string) => {
    let note: string | undefined;
    if (status === 'info_adicional') {
      // La nota se le envía al adoptante y es todo lo que va a leer: pedir información
      // sin decir cuál lo dejaba en un estado sin salida. Aquí sí es obligatoria.
      const answer = window.prompt('¿Qué información necesitas del adoptante?')?.trim();
      if (!answer) {
        toast.error('Indica qué información necesitas para que el adoptante sepa qué enviarte.');
        return;
      }
      note = answer;
    } else if (status === 'rechazada') {
      note = window.prompt('Motivo del rechazo (opcional):')?.trim() || undefined;
    }
    // `adoptionStatusSchema` valida `note` con `.max(1000)`: pasarse devuelve un 400 de
    // validación y la transición entera se cae con un "No se pudo actualizar" opaco.
    // Mejor recortar y decirlo que perder el cambio de estado.
    if (note && note.length > NOTE_MAX_LENGTH) {
      note = note.slice(0, NOTE_MAX_LENGTH);
      toast(`La nota se ha recortado a ${NOTE_MAX_LENGTH} caracteres, que es el máximo que acepta el servidor.`);
    }
    // Aprobar traspasa el animal al adoptante y el panel ya no ofrece marcha atrás:
    // confirmación explícita y sin prometer que se cierran las demás candidaturas
    // (el backend no las toca).
    if (
      status === 'aprobada' &&
      !window.confirm(
        `¿Aprobar la adopción de ${animalName || 'este animal'}? El animal pasará a ser del adoptante y no podrás deshacerlo.`,
      )
    ) {
      return;
    }
    setBusy({ id, status });
    try {
      await setAdoptionStatus(id, status, note);
      toast.success('Estado actualizado');
      await refetch();
      // El dashboard vive de otras claves: sin esto los contadores y el tablero
      // seguían mostrando el estado anterior tras cambiarlo aquí.
      qc.invalidateQueries({ queryKey: ['shelter-adoptions'] });
      qc.invalidateQueries({ queryKey: ['shelter-metrics'] });
      if (status === 'aprobada') qc.invalidateQueries({ queryKey: ['shelter-animals-count'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo actualizar');
    } finally {
      setBusy(null);
    }
  };

  const allItems = useMemo(() => data?.items || [], [data?.items]);
  // Sin datos no hay nada que contar: unos "(0)" en cada filtro parecían un dato real.
  const counts = useMemo(() => {
    if (!data) return null;
    return {
      abiertas: allItems.filter((it: any) => OPEN_STATES.includes(it.status)).length,
      todas: allItems.length,
      aprobadas: allItems.filter((it: any) => it.status === 'aprobada').length,
      cerradas: allItems.filter((it: any) => ['rechazada', 'cancelada'].includes(it.status)).length,
    };
  }, [allItems, data]);
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
            {f.label}{counts ? ` (${counts[f.key]})` : ''}
          </button>
        ))}
      </div>

      {data?.truncated && (
        <div className="text-xs text-gray-500">
          Mostrando las {allItems.length} solicitudes más recientes de {data.total}.
        </div>
      )}

      {isLoading ? (
        <div>Cargando…</div>
      ) : isError ? (
        // Un fallo de red se pintaba como "No hay solicitudes", que es mentira: la
        // protectora podía dejar candidaturas sin contestar creyendo que no había.
        <div className="border rounded-2xl p-6 grid gap-3 bg-white" style={{ borderColor: '#E7E1D5' }}>
          <h2 className="text-lg font-semibold">No hemos podido cargar las solicitudes</h2>
          <p className="text-sm text-gray-600">Puede ser un problema de conexión. Vuelve a intentarlo en un momento.</p>
          <div>
            <button
              type="button"
              onClick={() => refetch()}
              className="px-4 py-2 rounded border text-sm font-medium bg-white"
              style={{ borderColor: '#D7D0C2', color: '#3F4A3C' }}
            >
              Reintentar
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-gray-600">
          {filter === 'abiertas' && (counts?.todas || 0) > 0
            ? 'No tienes solicitudes abiertas ahora mismo. Mira "Todas" para ver el histórico.'
            : 'No hay solicitudes.'}
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((it: any) => {
            const id = it.id || it._id;
            const actions = nextAdoptionStatuses(it.status);
            // Al aprobar una candidatura el animal se traspasa, pero el backend no
            // cierra las demás: avisamos para que no se queden abiertas para siempre.
            const animalAlreadyAdopted = it.animal?.status === 'adoptado' && OPEN_STATES.includes(it.status);
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
                  <div className="text-xs text-gray-500">
                    {[
                      speciesLabel(it.animal?.species),
                      statusLabel(it.animal?.status) && `animal: ${statusLabel(it.animal.status).toLowerCase()}`,
                      it.createdAt && `solicitada el ${new Date(it.createdAt).toLocaleDateString('es-ES')}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <div
                    className="text-xs uppercase tracking-wide font-semibold"
                    style={{ color: STATUS_TONE[it.status] || '#6B7280' }}
                  >
                    {ADOPTION_STATUS_LABEL[it.status as keyof typeof ADOPTION_STATUS_LABEL] || it.status}
                  </div>
                  {animalAlreadyAdopted && (
                    <div className="text-xs" style={{ color: '#C05621' }}>
                      Este animal ya está adoptado. Cierra esta solicitud para que el adoptante no siga esperando.
                    </div>
                  )}
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
                        disabled={busy?.id === id}
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
                        {busy?.id === id && busy?.status === action ? 'Guardando…' : ACTION_LABEL[action]}
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
