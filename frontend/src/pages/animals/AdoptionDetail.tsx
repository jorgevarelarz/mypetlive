import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAdoption, setAdoptionStatus, ADOPTION_STATUS_LABEL, AdoptionShelterStatus, type AdoptionStatus } from '../../api/adoptions';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { toAbsoluteUrl } from '../../utils/media';

const MANAGE_ACTIONS: AdoptionShelterStatus[] = ['en_revision', 'info_adicional', 'cita_propuesta', 'preaprobada', 'aprobada', 'rechazada'];

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

function formatDate(value?: string) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function nextStep(status: AdoptionStatus, canManage: boolean) {
  if (canManage) {
    if (status === 'recibida') return 'Revisa la solicitud y pásala a revisión si encaja.';
    if (status === 'en_revision') return 'Valora el cuestionario y propone una cita o solicita más información.';
    if (status === 'cita_propuesta') return 'Confirma la visita y avanza a preaprobada cuando esté lista.';
    if (status === 'preaprobada') return 'Cierra la decisión final de adopción.';
    return 'Solicitud cerrada o pendiente de gestión específica.';
  }

  switch (status) {
    case 'recibida':
      return 'La protectora ha recibido tu solicitud.';
    case 'en_revision':
      return 'La protectora está revisando tu perfil y respuestas.';
    case 'info_adicional':
      return 'La protectora puede necesitar más información antes de avanzar.';
    case 'cita_propuesta':
      return 'La siguiente fase es coordinar una cita con la protectora.';
    case 'preaprobada':
      return 'Tu solicitud está en fase final.';
    case 'aprobada':
      return 'La protectora ha aprobado la adopción.';
    case 'rechazada':
      return 'Esta solicitud no ha continuado.';
    case 'cancelada':
      return 'Esta solicitud fue cancelada.';
    default:
      return 'Consulta este detalle para seguir el proceso.';
  }
}

export default function AdoptionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['adoption', id], queryFn: () => getAdoption(id || ''), enabled: !!id });

  if (isLoading || !data) return <div className="p-4">Cargando solicitud...</div>;

  const adoption: any = data;
  const status = adoption.status as AdoptionStatus;
  const animal = adoption.animal || {};
  const tone = STATUS_TONE[status] || STATUS_TONE.recibida;
  const canManage = user?.role === 'landlord' || user?.role === 'admin';
  const image = Array.isArray(animal.images) ? animal.images[0] : undefined;

  const decide = async (newStatus: AdoptionShelterStatus) => {
    try {
      await setAdoptionStatus(String(id), newStatus);
      toast.success('Estado actualizado');
      refetch();
    } catch {
      toast.error('Error actualizando');
    }
  };

  return (
    <div className="grid gap-5 p-4" style={{ color: '#3F4A3C' }}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={canManage ? '/landlord/adoptions' : '/adoptions/mine'} className="text-sm font-medium" style={{ color: '#1F6F6F' }}>
            Volver a solicitudes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Solicitud de adopción</h1>
          <p className="mt-1 text-sm" style={{ color: '#7A8273' }}>
            Creada el {formatDate(adoption.createdAt)}
          </p>
        </div>
        <span
          className="inline-flex items-center border px-3 py-1 text-sm font-medium"
          style={{ background: tone.bg, borderColor: tone.border, color: tone.text, borderRadius: 999 }}
        >
          {statusLabel(status)}
        </span>
      </header>

      <section className="grid gap-4 border bg-white p-4 md:grid-cols-[220px_1fr]" style={{ borderColor: '#E7E1D5', borderRadius: 8 }}>
        <div className="overflow-hidden bg-[#F6F3EC]" style={{ borderRadius: 8, aspectRatio: '4 / 3' }}>
          {image ? (
            <img src={toAbsoluteUrl(image)} alt={animal.name || 'Animal'} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm" style={{ color: '#7A8273' }}>Sin imagen</div>
          )}
        </div>
        <div className="grid content-start gap-3">
          <div>
            <h2 className="text-xl font-semibold">{animal.name || 'Animal'}</h2>
            <p className="mt-1 text-sm" style={{ color: '#7A8273' }}>
              {animal.species || 'Mascota'}
              {animal.breed ? ` · ${animal.breed}` : ''}
              {animal.age ? ` · ${animal.age}` : ''}
              {animal.code ? ` · ${animal.code}` : ''}
            </p>
          </div>
          <div className="border-t pt-3" style={{ borderColor: '#F0ECE2' }}>
            <div className="text-sm font-medium">Siguiente paso</div>
            <p className="mt-1 text-sm" style={{ color: '#7A8273' }}>
              {nextStep(status, canManage)}
            </p>
          </div>
          {animal._id && (
            <Link to={`/animals/${animal._id}`} className="text-sm font-medium" style={{ color: '#1F6F6F' }}>
              Ver ficha del animal
            </Link>
          )}
        </div>
      </section>

      {Array.isArray(adoption.answers) && adoption.answers.length > 0 && (
        <section className="grid gap-3 border bg-white p-4" style={{ borderColor: '#E7E1D5', borderRadius: 8 }}>
          <h2 className="text-lg font-semibold">Respuestas del cuestionario</h2>
          <div className="grid gap-3">
            {adoption.answers.map((entry: any, index: number) => (
              <div key={`${entry.question || index}`} className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: '#F0ECE2' }}>
                <div className="text-sm font-medium">{entry.question || `Pregunta ${index + 1}`}</div>
                <p className="mt-1 text-sm" style={{ color: '#7A8273' }}>
                  {entry.answer || 'Sin respuesta'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {canManage && (
        <section className="grid gap-3 border bg-white p-4" style={{ borderColor: '#E7E1D5', borderRadius: 8 }}>
          <h2 className="text-lg font-semibold">Gestionar estado</h2>
          <div className="flex flex-wrap gap-2">
            {MANAGE_ACTIONS.map((newStatus) => (
              <button
                key={newStatus}
                type="button"
                className="border px-3 py-2 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: '#D7D0C2', borderRadius: 8 }}
                onClick={() => decide(newStatus)}
                disabled={newStatus === status}
              >
                {statusLabel(newStatus)}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
