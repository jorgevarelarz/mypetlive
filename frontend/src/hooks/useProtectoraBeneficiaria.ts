import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import api from '../api/client';
import { getMyPatitas, listProtectoras } from '../api/patitas';
import { useAuth } from '../context/AuthContext';
import { loadPreferredProtectora, savePreferredProtectora, type PreferredProtectora } from '../utils/preferredProtectora';

/**
 * La protectora a la que van las Patitas del cliente. Es la de la donación
 * automática del perfil (`profile.autoDonate`), que es la que usa el servidor
 * al dar Patitas (AUD-5, FAC-151): antes Cupones y Mi mascota guardaban otra en
 * el navegador y la pantalla enseñaba una protectora que no recibía nada.
 * Sin sesión de familia, se queda en el navegador como hasta ahora.
 */
export function useProtectoraBeneficiaria() {
  const { user, updateUser } = useAuth() as any;
  const qc = useQueryClient();
  const esFamilia = (user as any)?.role === 'tenant';
  const meId = String((user as any)?._id || (user as any)?.id || '');
  const meQ = useQuery({ queryKey: ['patitas-me'], queryFn: getMyPatitas, enabled: esFamilia, staleTime: 60_000 });
  const protesQ = useQuery({ queryKey: ['protectoras'], queryFn: listProtectoras, enabled: esFamilia, staleTime: 5 * 60_000 });

  const auto = meQ.data?.autoDonate;
  const delServidor: PreferredProtectora | null = auto?.shelterId
    ? { id: auto.shelterId, name: protesQ.data?.items.find(p => p.id === auto.shelterId)?.name || 'tu protectora' }
    : null;

  const guardar = useMutation({
    mutationFn: async (value: PreferredProtectora | null) => {
      const next = value ? { enabled: true, shelterId: value.id } : { enabled: false };
      const { data } = await api.patch(`/api/users/${meId}`, { profile: { autoDonate: next } }, { skipErrorToast: true } as any);
      return data;
    },
    onSuccess: (updated: any, value) => {
      updateUser?.(updated);
      savePreferredProtectora(value);
      qc.invalidateQueries({ queryKey: ['patitas-me'] });
      toast.success(value ? `Tus Patitas irán a ${value.name}` : 'Donación automática desactivada');
    },
    onError: (e: any) => toast.error(e?.response?.data?.code === 'shelter_verification_required' || e?.response?.data?.error === 'shelter_verification_required'
      ? 'Esa protectora aún no puede recibir donaciones.'
      : 'No se pudo guardar la protectora'),
  });

  if (!esFamilia) {
    return {
      protectora: loadPreferredProtectora(),
      activa: false,
      cargando: false,
      elegir: (value: PreferredProtectora | null) => savePreferredProtectora(value),
    };
  }
  return {
    protectora: delServidor,
    activa: Boolean(auto?.enabled && auto?.shelterId),
    cargando: meQ.isLoading || guardar.isPending,
    elegir: (value: PreferredProtectora | null) => guardar.mutate(value),
  };
}
