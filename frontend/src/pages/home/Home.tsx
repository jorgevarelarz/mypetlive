import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { markAnimalFeeding, markAnimalLitter } from '../../api/animals';
import { echoPatita, getPatitasBalance } from '../../api/patitas';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { fetchFeaturedAnimal, AnimalDoc } from '../../utils/featuredAnimal';

export default function Home() {
  const nav = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const assignedAnimalId = (user as any)?.assignedAnimalId || (user as any)?.animalId || (user as any)?.petId || null;

  const { data: featuredAnimal, isLoading } = useQuery({
    queryKey: ['tenant-featured-animal', assignedAnimalId],
    queryFn: () => fetchFeaturedAnimal(assignedAnimalId),
    staleTime: 60_000,
  });

  const shelterId = featuredAnimal?.shelter ? String(featuredAnimal.shelter) : undefined;

  const patitasQueryKey: [string, string] = ['patitas-balance', shelterId || 'global'];

  const {
    data: patitasData,
    isLoading: patitasLoading,
  } = useQuery({
    queryKey: patitasQueryKey,
    queryFn: () => getPatitasBalance(shelterId),
    enabled: !!user,
    staleTime: 30_000,
  });

  const echoMutation = useMutation<{ ok: boolean; newBalance: number }, unknown, void, { previous?: any }>({
    mutationFn: async () => {
      if (!shelterId) throw new Error('missing_shelter');
      const animalRef = featuredAnimal?._id || featuredAnimal?.id;
      return echoPatita({ shelterId, animalId: animalRef ? String(animalRef) : undefined });
    },
    onMutate: async () => {
      if (!shelterId) return {};
      await queryClient.cancelQueries({ queryKey: patitasQueryKey });
      const previous = queryClient.getQueryData(patitasQueryKey);
      queryClient.setQueryData(patitasQueryKey, (old: any) => ({
        ...(old || {}),
        patitas: Math.max(0, (old?.patitas ?? 0) + 1),
      }));
      return { previous };
    },
    onSuccess: data => {
      toast.success('Tu ayuda llegó donde hace falta 🤍');
      queryClient.setQueryData(patitasQueryKey, (old: any) => ({
        ...(old || {}),
        patitas: data?.newBalance ?? old?.patitas ?? 0,
      }));
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(patitasQueryKey, context.previous);
      }
      toast.error('No se pudo registrar. Inténtalo de nuevo');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['patitas-balance'] });
    },
  });

  const handleEchoPatita = () => {
    if (!shelterId) {
      toast.error('No encontramos una protectora para esta mascota.');
      return;
    }
    echoMutation.mutate();
  };

  const careMutation = useMutation<{ ok: boolean } | any, unknown, 'feed' | 'litter'>({
    mutationFn: async type => {
      if (!featuredAnimal) throw new Error('missing_animal');
      const animalId = String(featuredAnimal._id || featuredAnimal.id || '');
      if (!animalId) throw new Error('missing_animal');
      if (type === 'feed') return markAnimalFeeding(animalId);
      return markAnimalLitter(animalId);
    },
    onSuccess: (_data, type) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-featured-animal', assignedAnimalId] });
      toast.success(type === 'feed' ? 'Gracias por cuidar de él 🌿' : 'Gracias por mantener su espacio limpio ✨');
    },
    onError: () => toast.error('No se pudo registrar el cuidado'),
  });

  const describeFeeding = () => {
    if (!featuredAnimal?.lastFeeding) return 'Aún no registramos una comida.';
    const last = new Date(featuredAnimal.lastFeeding);
    const hours = (Date.now() - last.getTime()) / 36e5;
    return hours < 24 ? 'Popeye ya comió hoy 🫶' : 'Puede que toque rellenar comida 🌿';
  };

  const describeLitter = () => {
    if (!featuredAnimal?.lastLitterChange) return 'Aún no registramos un cambio de arena.';
    const last = new Date(featuredAnimal.lastLitterChange);
    const hours = (Date.now() - last.getTime()) / 36e5;
    return hours < 72 ? 'Arena en buen estado.' : 'Quizás convenga cambiar la arena pronto ✨';
  };

  const primary = '#3F4A3C';
  const bg = '#F6F3EC';
  const radius = 16;

  const displayName = featuredAnimal?.name || 'Popeye';
  const displaySpecies = featuredAnimal?.species || 'Gato';
  const displayAge = featuredAnimal?.age || '3 años';
  return (
    <div style={{ background: bg, color: primary, borderRadius: radius, padding: 24 }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <header>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '.01em', margin: 0 }}>{displayName}</h1>
          <p style={{ margin: '6px 0 0', opacity: 0.9 }}>{displaySpecies} · {displayAge}</p>
        </header>

        <section style={{ display: 'grid', gap: 12 }}>
          <div style={{ borderRadius: 16, border: '1px solid #E7E1D5', background: '#FFFFFF', padding: 20 }}>
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold" style={{ color: primary }}>Tu mascota</h2>
              <p style={{ color: '#7A8273', margin: 0 }}>Revisa su cuidado, historial y Patitas.</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" onClick={() => nav('/pet')}>Ver Mi Mascota ›</button>
                <button type="button" onClick={() => nav('/animals')}>Ver animales en adopción</button>
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 8, display: 'grid', gap: 12 }}>
          <div style={{ background: '#fff9f1', borderRadius: 16, padding: '18px 20px', lineHeight: 1.5 }}>
            <p style={{ margin: 0, color: primary }}>
              Popeye está bien 🌿<br />
              Cuando necesite algo, te avisaremos con suavidad.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Pequeños cuidados</h2>
            <p style={{ margin: 0, color: primary, maxWidth: 360, lineHeight: 1.4 }}>
              Cuidar no siempre es hacer. A veces es simplemente estar cerca.
            </p>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', display: 'grid', gap: 10, border: '1px solid #ebeadf' }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Patitas 🤍</h3>
              <p style={{ margin: '4px 0 0', color: primary }}>
                Cada Patita es un gesto de ayuda hacia la protectora.
              </p>
            </div>
            <p style={{ margin: 0, color: primary, fontSize: 15 }}>
              {patitasLoading
                ? 'Cargando Patitas…'
                : `Has echado ${(patitasData?.patitas ?? 0)} Patitas este mes.`}
            </p>
            <button
              type="button"
              onClick={handleEchoPatita}
              disabled={!shelterId || echoMutation.isPending}
              style={{
                borderRadius: 12,
                border: '1px solid #d6d2c2',
                background: '#fff',
                color: primary,
                padding: '12px 14px',
                fontWeight: 500,
                textAlign: 'left',
                opacity: !shelterId || echoMutation.isPending ? 0.6 : 1,
              }}
            >
              {echoMutation.isPending ? 'Registrando…' : 'Echar una Patita ›'}
            </button>
            <button
              type="button"
              onClick={() => nav('/coupons')}
              className="text-sm mt-1"
              style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              Ver cupones
            </button>
          </div>

          {featuredAnimal && user?.role === 'tenant' && (
            <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', display: 'grid', gap: 12, border: '1px solid #ebeadf' }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Cuidado diario</h3>
                <p style={{ margin: '4px 0 0', color: primary }}>{describeFeeding()}</p>
                <p style={{ margin: '4px 0 0', color: primary }}>{describeLitter()}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => careMutation.mutate('feed')} disabled={careMutation.isPending}>
                  Marcar comida
                </button>
                <button type="button" onClick={() => careMutation.mutate('litter')} disabled={careMutation.isPending}>
                  Cambiar arena
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
