import { useQuery } from '@tanstack/react-query';
import { getUnreadCount } from '../api/chat';
import { useAuth } from '../context/AuthContext';

export const UNREAD_KEY = ['chat-unread'];

/**
 * Mensajes sin leer del usuario, para el número del menú y de la barra de
 * abajo. Una sola consulta compartida (react-query) aunque lo pinten varios
 * sitios a la vez; se refresca cada 30 s y al volver a la pestaña.
 */
export function useUnreadMessages(): number {
  const { user } = useAuth();
  const enabled = Boolean(user?._id) && ['tenant', 'landlord', 'vet'].includes(String(user?.role));
  const { data } = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: getUnreadCount,
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
  return enabled ? data?.total || 0 : 0;
}
