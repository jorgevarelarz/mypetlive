import React, { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { listMyAdoptions, cancelAdoption, ADOPTION_STATUS_LABEL, type AdoptionStatus } from '../../api/adoptions';
import { toAbsoluteUrl } from '../../utils/media';
import { speciesLabel } from '../../styles/mypetlive';
import { M } from '../../components/pet/maqueta';
import { CalcoSolHuella, CalcoSolLupa } from '../../components/icons/calcados';

const STATUS_STEPS: AdoptionStatus[] = [
  'recibida',
  'en_revision',
  'cita_propuesta',
  'preaprobada',
  'aprobada',
];

const TERMINAL_STATUS = new Set<AdoptionStatus>(['aprobada', 'rechazada', 'cancelada']);

const STATUS_TONE: Record<string, { bg: string; border: string; text: string }> = {
  recibida: { bg: '#F6F3EC', border: '#D7D0C2', text: '#3F4A3C' },
  cuestionario_pendiente: { bg: '#FFF7E8', border: '#E9A93C', text: '#765118' },
  en_revision: { bg: '#EEF7F6', border: '#1F6F6F', text: '#1F6F6F' },
  info_adicional: { bg: '#FFF0EC', border: '#E8654A', text: '#8F3827' },
  cita_propuesta: { bg: '#EEF7F6', border: '#1F6F6F', text: '#1F6F6F' },
  preaprobada: { bg: '#F1F5E9', border: '#6A7B4F', text: '#44522F' },
  aprobada: { bg: '#EAF7EF', border: '#2F855A', text: '#276749' },
  rechazada: { bg: '#F8EAEA', border: '#C05656', text: '#8F2F2F' },
  cancelada: { bg: '#F1F1F1', border: '#A0A0A0', text: '#555555' },
};

function statusLabel(status: string) {
  return ADOPTION_STATUS_LABEL[status as AdoptionStatus] || status;
}

function getStepIndex(status: AdoptionStatus) {
  if (status === 'cuestionario_pendiente') return 0;
  if (status === 'info_adicional') return 1;
  const idx = STATUS_STEPS.indexOf(status);
  return idx >= 0 ? idx : 0;
}

function nextStep(status: AdoptionStatus) {
  switch (status) {
    case 'recibida':
    case 'cuestionario_pendiente':
      return 'La protectora revisará tu solicitud y el cuestionario.';
    case 'en_revision':
      return 'Tu solicitud está siendo revisada. Te avisarán si necesitan algo más.';
    case 'info_adicional':
      // La nota con lo que piden y el chat para responder están en el detalle.
      return 'La protectora necesita información adicional: ábrela para ver qué te piden y responder.';
    case 'cita_propuesta':
      return 'La protectora ha propuesto una cita: ábrela para concretar día y hora por el chat.';
    case 'preaprobada':
      return 'Estás en la fase final. La protectora cerrará la decisión contigo.';
    case 'aprobada':
      // Aprobar ya traspasa el animal al adoptante en el mismo paso: no hay cierre pendiente.
      return 'Adopción aprobada. Tu nueva mascota ya está en Mi Mascota.';
    case 'rechazada':
      return 'Esta solicitud no ha continuado. Puedes seguir explorando otros animales.';
    case 'cancelada':
      return 'Esta solicitud fue cancelada.';
    default:
      return 'Revisa el detalle para ver el estado actualizado.';
  }
}

function formatDate(value?: string) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function AdoptionCard({ item, onCancel, canceling }: { item: any; onCancel: (id: string) => void; canceling: boolean }) {
  const status = item.status as AdoptionStatus;
  const tone = STATUS_TONE[status] || STATUS_TONE.recibida;
  const animal = item.animal || {};
  const animalId = animal._id || animal.id;
  const image = Array.isArray(animal.images) ? animal.images[0] : undefined;
  const stepIndex = getStepIndex(status);
  const isTerminal = TERMINAL_STATUS.has(status);

  return (
    <article
      className="grid gap-4 border bg-white p-4 md:grid-cols-[160px_1fr] md:p-5"
      style={{ borderColor: '#E7E1D5', borderRadius: 8 }}
    >
      <div
        className="overflow-hidden bg-[#F6F3EC]"
        style={{ borderRadius: 8, aspectRatio: '4 / 3' }}
      >
        {image ? (
          <img src={toAbsoluteUrl(image)} alt={animal.name || 'Animal'} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm" style={{ color: '#7A8273' }}>
            Sin imagen
          </div>
        )}
      </div>

      <div className="min-w-0 grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: '#3F4A3C' }}>
              {animal.name || 'Animal'}
            </h2>
            <p className="mt-1 text-sm" style={{ color: '#7A8273' }}>
              {speciesLabel(animal.species) || 'Mascota'}
              {animal.breed ? ` · ${animal.breed}` : ''}
              {animal.code ? ` · ${animal.code}` : ''}
            </p>
          </div>
          <span
            className="inline-flex items-center border px-3 py-1 text-sm font-medium"
            style={{ background: tone.bg, borderColor: tone.border, color: tone.text, borderRadius: 999 }}
          >
            {statusLabel(status)}
          </span>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-2" aria-label={`Estado ${statusLabel(status)}`}>
            {STATUS_STEPS.map((step, idx) => {
              const active = !isTerminal && idx <= stepIndex;
              const approved = status === 'aprobada' && idx <= stepIndex;
              return (
                <span
                  key={step}
                  className="h-2 flex-1"
                  title={statusLabel(step)}
                  style={{
                    borderRadius: 999,
                    background: active || approved ? '#1F6F6F' : '#E7E1D5',
                  }}
                />
              );
            })}
          </div>
          <p className="text-sm" style={{ color: '#3F4A3C' }}>
            {nextStep(status)}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: '#F0ECE2' }}>
          <span className="text-sm" style={{ color: '#7A8273' }}>
            Solicitud enviada el {formatDate(item.createdAt)}
          </span>
          <div className="flex flex-wrap gap-2">
            {/* Al aprobar la adopción el animal pasa a mascota personal y la ficha
                pública responde 404: el enlace correcto pasa a ser Mi Mascota. */}
            {status === 'aprobada' ? (
              <Link
                to="/pet"
                className="border px-3 py-2 text-sm font-medium"
                style={{ borderColor: '#D7D0C2', borderRadius: 8, color: '#3F4A3C' }}
              >
                Ver mi mascota
              </Link>
            ) : animalId ? (
              <Link
                to={`/animals/${animalId}`}
                className="border px-3 py-2 text-sm font-medium"
                style={{ borderColor: '#D7D0C2', borderRadius: 8, color: '#3F4A3C' }}
              >
                Ver animal
              </Link>
            ) : null}
            <Link
              to={`/adoptions/${item.id}`}
              className="px-3 py-2 text-sm font-medium text-white"
              style={{ background: '#1F6F6F', borderRadius: 8 }}
            >
              Ver solicitud
            </Link>
            {!isTerminal && (
              <button
                type="button"
                onClick={() => onCancel(String(item.id))}
                disabled={canceling}
                className="border px-3 py-2 text-sm font-medium"
                style={{ borderColor: '#C05656', borderRadius: 8, color: '#8F2F2F', background: '#fff', cursor: canceling ? 'default' : 'pointer' }}
              >
                {canceling ? 'Cancelando…' : 'Cancelar solicitud'}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function MyAdoptions() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['my-adoptions'], queryFn: listMyAdoptions });
  const items = useMemo(() => data?.items || [], [data?.items]);

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelAdoption(id),
    onSuccess: () => {
      toast.success('Solicitud cancelada');
      queryClient.invalidateQueries({ queryKey: ['my-adoptions'] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.error === 'already_closed' ? 'Esta solicitud ya está cerrada' : 'No se pudo cancelar la solicitud'),
  });

  const handleCancel = (id: string) => {
    if (window.confirm('¿Seguro que quieres retirar esta solicitud de adopción? Esta acción no se puede deshacer.')) {
      cancelMutation.mutate(id);
    }
  };
  const activeCount = items.filter((item: any) => !TERMINAL_STATUS.has(item.status)).length;
  const approvedCount = items.filter((item: any) => item.status === 'aprobada').length;

  if (isLoading) {
    return <div className="p-4">Cargando solicitudes...</div>;
  }

  return (
    // Maqueta del 2 nov 2026 (cabecera con dibujo, botón verde, vacío con portapapeles),
    // a tamaño normal de iPhone.
    <div className="grid gap-5" style={{ color: '#3F4A3C', maxWidth: 640, margin: '0 auto', padding: '4px 0 0', fontFamily: M.letra }}>
      <header style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px', alignItems: 'center', gap: 4 }}>
          <div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#2E6B3F' }}>Adopciones</p>
            <h1 style={{ margin: '2px 0 6px', fontFamily: M.titulos, fontSize: 30, lineHeight: '34px', fontWeight: 800, color: '#17352D' }}>Mis solicitudes</h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: '21px', color: '#5E6460' }}>
              Sigue el estado de cada proceso y revisa los próximos pasos con la protectora.
            </p>
          </div>
          <img src="/ilustraciones/solicitudes-cabecera.png" alt="" aria-hidden style={{ width: 150, height: 'auto' }} />
        </div>
        <Link
          to="/animals"
          style={{ display: 'flex', alignItems: 'center', gap: 14, height: 54, padding: '0 20px', borderRadius: 16, background: '#0E5F5B', color: '#fff', fontSize: 17, fontWeight: 800, textDecoration: 'none' }}
        >
          <CalcoSolLupa size={21} color="#FFFFFF" />
          Buscar animales
        </Link>
      </header>

      {/* Contadores solo cuando hay datos reales que contar: en error o vacío
          eran tres ceros que parecían un dato. */}
      {!isError && items.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="border bg-white p-4" style={{ borderColor: '#E7E1D5', borderRadius: 8 }}>
            <div className="text-sm" style={{ color: '#7A8273' }}>Total</div>
            <div className="mt-1 text-2xl font-semibold">{items.length}</div>
          </div>
          <div className="border bg-white p-4" style={{ borderColor: '#E7E1D5', borderRadius: 8 }}>
            <div className="text-sm" style={{ color: '#7A8273' }}>En proceso</div>
            <div className="mt-1 text-2xl font-semibold">{activeCount}</div>
          </div>
          <div className="border bg-white p-4" style={{ borderColor: '#E7E1D5', borderRadius: 8 }}>
            <div className="text-sm" style={{ color: '#7A8273' }}>Aprobadas</div>
            <div className="mt-1 text-2xl font-semibold">{approvedCount}</div>
          </div>
        </section>
      )}

      {isError ? (
        // Un fallo de red se pintaba como "Aún no tienes solicitudes", que es mentira.
        <section className="grid gap-3 border bg-white p-6" style={{ borderColor: '#E7E1D5', borderRadius: 8 }}>
          <h2 className="text-xl font-semibold">No hemos podido cargar tus solicitudes</h2>
          <p className="max-w-xl text-sm" style={{ color: '#7A8273' }}>
            Puede ser un problema de conexión. Vuelve a intentarlo en un momento.
          </p>
          <div>
            <button
              type="button"
              onClick={() => refetch()}
              className="border px-4 py-2 text-sm font-medium"
              style={{ borderColor: '#D7D0C2', borderRadius: 8, color: '#3F4A3C', background: '#fff' }}
            >
              Reintentar
            </button>
          </div>
        </section>
      ) : items.length === 0 ? (
        <>
          <section style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 12, padding: '24px 20px 26px', background: '#FEFEFE', border: '1px solid #EEE9E1', borderRadius: 22, boxShadow: '0 8px 20px -16px rgba(60,45,30,.3)' }}>
            <img src="/ilustraciones/solicitudes-vacio.png" alt="" aria-hidden style={{ width: 150, height: 'auto' }} />
            <h2 style={{ margin: 0, fontFamily: M.titulos, fontSize: 22, fontWeight: 800, color: '#17352D' }}>Aún no tienes solicitudes</h2>
            <p style={{ margin: 0, maxWidth: 300, fontSize: 15.5, lineHeight: '22px', color: '#5E6460' }}>
              Cuando solicites una adopción, aparecerá aquí con su estado y los siguientes pasos.
            </p>
            <Link to="/animals" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 50, padding: '0 22px', marginTop: 4, border: '1.5px solid #0E5F5B', borderRadius: 16, color: '#0E5F5B', fontSize: 16, fontWeight: 800, textDecoration: 'none' }}>
              <CalcoSolHuella size={20} />
              Explorar animales disponibles
            </Link>
          </section>
          <img src="/ilustraciones/solicitudes-pie.png" alt="" aria-hidden style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }} />
        </>
      ) : (
        <section className="grid gap-3">
          {items.map((item: any) => (
            <AdoptionCard
              key={item.id}
              item={item}
              onCancel={handleCancel}
              canceling={cancelMutation.isPending && cancelMutation.variables === String(item.id)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
