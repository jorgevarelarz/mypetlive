import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { searchAnimals } from '../../api/animals';
import { listAdoptionsForMyAnimals } from '../../api/adoptions';
import { getPatitasBalance } from '../../api/patitas';

const ANIMAL_STATUS_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  publicado: 'Publicado',
  reservado: 'Reservado',
  preadoptado: 'Preadoptado',
  adoptado: 'Adoptado',
  no_disponible: 'No disponible',
  archivado: 'Archivado',
};

const OPEN_ADOPTION_STATES = ['recibida', 'cuestionario_pendiente', 'en_revision', 'info_adicional', 'cita_propuesta', 'preaprobada'];

function Kpi({ label, value, tone = '#3F4A3C' }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: '#E7E1D5' }}>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-semibold mt-1" style={{ color: tone }}>{value}</div>
    </div>
  );
}

export default function ProtectoraDashboard() {
  const { user } = useAuth();
  const shelterId = String(user?._id || '');

  const animalsQ = useQuery({
    queryKey: ['shelter-animals', shelterId],
    queryFn: () => searchAnimals({ shelter: shelterId, limit: 100, page: 1, sort: 'createdAt', dir: 'desc' }),
    enabled: !!shelterId,
  });
  const adoptionsQ = useQuery({
    queryKey: ['shelter-adoptions', shelterId],
    queryFn: () => listAdoptionsForMyAnimals({ page: 1, limit: 100 }),
    enabled: !!shelterId,
  });
  const patitasQ = useQuery({
    queryKey: ['patitas-balance', shelterId],
    queryFn: () => getPatitasBalance(shelterId),
    enabled: !!shelterId,
    staleTime: 30_000,
  });

  const animals = animalsQ.data?.items || [];
  const adoptions = adoptionsQ.data?.items || [];

  const byStatus = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const a of animals) acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, [animals]);

  const openAdoptions = adoptions.filter((a: any) => OPEN_ADOPTION_STATES.includes(a.status)).length;

  return (
    <div className="p-4 grid gap-5">
      <header>
        <h1 className="text-2xl font-semibold">Hola{user?.name ? `, ${user.name}` : ''} 👋</h1>
        <p className="text-gray-600">Resumen de tu protectora y accesos rápidos.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Animales totales" value={animalsQ.isLoading ? '…' : animals.length} />
        <Kpi label="Publicados" value={animalsQ.isLoading ? '…' : (byStatus.publicado || 0)} tone="#2F855A" />
        <Kpi label="Solicitudes en proceso" value={adoptionsQ.isLoading ? '…' : openAdoptions} tone="#2B6CB0" />
        <Kpi label="Patitas disponibles" value={patitasQ.isLoading ? '…' : (patitasQ.data?.patitas ?? 0)} tone="#6A7B4F" />
      </div>

      <section className="grid md:grid-cols-3 gap-3">
        <Link to="/landlord/animals" className="rounded-2xl border p-4 bg-white hover:shadow-sm transition" style={{ borderColor: '#E7E1D5' }}>
          <div className="font-semibold">🐾 Mis animales</div>
          <div className="text-sm text-gray-600 mt-1">Crea, edita, publica y archiva fichas.</div>
        </Link>
        <Link to="/landlord/adoptions" className="rounded-2xl border p-4 bg-white hover:shadow-sm transition" style={{ borderColor: '#E7E1D5' }}>
          <div className="font-semibold">📋 Solicitudes de adopción</div>
          <div className="text-sm text-gray-600 mt-1">Gestiona candidaturas por estados.</div>
        </Link>
        <Link to="/landlord/questionnaire" className="rounded-2xl border p-4 bg-white hover:shadow-sm transition" style={{ borderColor: '#E7E1D5' }}>
          <div className="font-semibold">❓ Cuestionario</div>
          <div className="text-sm text-gray-600 mt-1">Define las preguntas para adoptantes.</div>
        </Link>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: '#E7E1D5' }}>
          <h2 className="font-semibold mb-2">Animales por estado</h2>
          {animalsQ.isLoading ? (
            <div className="text-gray-500">Cargando…</div>
          ) : animals.length === 0 ? (
            <div className="text-gray-600">Aún no tienes animales. <Link to="/landlord/animals" className="text-emerald-700 underline">Crea el primero</Link>.</div>
          ) : (
            <ul className="grid gap-1 text-sm">
              {Object.entries(ANIMAL_STATUS_LABEL).map(([key, label]) => (
                <li key={key} className="flex justify-between border-b last:border-0 py-1" style={{ borderColor: '#F0ECE2' }}>
                  <span className="text-gray-600">{label}</span>
                  <span className="font-medium">{byStatus[key] || 0}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: '#E7E1D5' }}>
          <h2 className="font-semibold mb-2">Solicitudes recientes</h2>
          {adoptionsQ.isLoading ? (
            <div className="text-gray-500">Cargando…</div>
          ) : adoptions.length === 0 ? (
            <div className="text-gray-600">Sin solicitudes todavía.</div>
          ) : (
            <ul className="grid gap-2 text-sm">
              {adoptions.slice(0, 6).map((it: any) => (
                <li key={it.id} className="flex justify-between">
                  <span className="text-gray-700">{it.animal?.name || 'Animal'} · {it.adopter?.name || 'Adoptante'}</span>
                  <span className="text-xs uppercase tracking-wide text-gray-500">{it.status}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/landlord/adoptions" className="inline-block mt-3 text-emerald-700 underline text-sm">Ver todas</Link>
        </div>
      </section>
    </div>
  );
}
