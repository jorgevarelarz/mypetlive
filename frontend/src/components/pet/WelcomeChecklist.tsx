import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { getWelcomePlan, toggleWelcomeTask } from '../../api/welcome';

type Props = {
  animalId: string;
  petName?: string;
};

// Checklist de primeros pasos que se activa al aprobarse la adopción.
// Si la mascota no tiene plan (registro personal, adopciones antiguas), no pinta nada.
export default function WelcomeChecklist({ animalId, petName }: Props) {
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const { data: plan } = useQuery({
    queryKey: ['welcome-plan', animalId],
    queryFn: () => getWelcomePlan(animalId),
    enabled: Boolean(animalId),
    retry: false,
    staleTime: 60_000,
  });

  const toggleMutation = useMutation({
    mutationFn: (key: string) => toggleWelcomeTask(animalId, key),
    onSuccess: updated => {
      queryClient.setQueryData(['welcome-plan', animalId], updated);
      if (updated.progress.done === updated.progress.total) {
        toast.success('¡Plan de bienvenida completado! 🎉');
      }
    },
    onError: () => toast.error('No se pudo actualizar la tarea'),
  });

  if (!plan) return null;

  const { done, total } = plan.progress;
  const completed = done === total;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="border rounded-2xl p-4 grid gap-3" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
      <div>
        <h2 className="text-lg font-semibold">
          {completed ? `¡${petName || 'Tu mascota'} ya está en casa! 💚` : `Plan de bienvenida de ${petName || 'tu mascota'}`}
        </h2>
        <p className="text-xs" style={{ color: '#7A8273' }}>
          {completed
            ? 'Habéis completado todos los primeros pasos. ¡Disfrutad de la nueva vida juntos!'
            : 'Primeros pasos recomendados tras la adopción. Marca cada uno cuando lo tengáis hecho.'}
        </p>
      </div>

      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#F1ECE4' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: '#1F6F6F' }}
        />
      </div>
      <span className="text-xs" style={{ color: '#6A7B4F' }}>{done} de {total} pasos completados</span>

      <ul className="grid gap-2">
        {plan.tasks.map(task => (
          <li
            key={task.key}
            className="flex items-start gap-3 border rounded-xl px-3 py-2"
            style={{ borderColor: '#E7E1D5', opacity: task.done ? 0.75 : 1 }}
          >
            <button
              type="button"
              aria-label={task.done ? `Desmarcar: ${task.title}` : `Marcar como hecho: ${task.title}`}
              onClick={() => toggleMutation.mutate(task.key)}
              disabled={toggleMutation.isPending}
              className="mt-0.5 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold shrink-0"
              style={
                task.done
                  ? { background: '#1F6F6F', borderColor: '#1F6F6F', color: '#FFFFFF' }
                  : { borderColor: '#B9B2A4', color: 'transparent', background: '#FFFFFF' }
              }
            >
              ✓
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={task.done ? { textDecoration: 'line-through' } : undefined}>
                {task.title}
              </div>
              <div className="text-xs" style={{ color: '#7A8273' }}>{task.description}</div>
            </div>
            {task.link && !task.done && (
              <button
                type="button"
                onClick={() => nav(task.link as string)}
                className="text-xs font-semibold shrink-0"
                style={{ color: '#1F6F6F', textDecoration: 'underline', textUnderlineOffset: 3 }}
              >
                Ir →
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
