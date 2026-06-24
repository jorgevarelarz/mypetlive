import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addAnimalFavorite,
  importAnimalFavorites,
  listFavoriteAnimals,
  removeAnimalFavorite,
} from '../api/animals';
import { useAuth } from '../context/AuthContext';
import {
  FAVORITES_EVENT,
  clearLocalFavorites,
  getFavorites,
  toggleFavorite,
} from '../utils/favorites';

export function useAnimalFavorites() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [localIds, setLocalIds] = useState<string[]>(getFavorites);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const query = useQuery({
    queryKey: ['animal-favorites', user?._id],
    queryFn: listFavoriteAnimals,
    enabled: Boolean(user),
    staleTime: 15_000,
  });

  useEffect(() => {
    const sync = () => setLocalIds(getFavorites());
    window.addEventListener(FAVORITES_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(FAVORITES_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (!user?._id) return;
    const ids = getFavorites();
    if (!ids.length) return;
    importAnimalFavorites(ids)
      .then(() => {
        clearLocalFavorites();
        queryClient.invalidateQueries({ queryKey: ['animal-favorites', user._id] });
      })
      .catch(() => undefined);
  }, [queryClient, user?._id]);

  const serverIds = useMemo(() => query.data?.ids || [], [query.data?.ids]);
  const ids = user ? serverIds : localIds;

  const toggle = useCallback(async (id: string) => {
    if (!user) {
      setLocalIds(toggleFavorite(id));
      return;
    }
    if (pendingIds.includes(id)) return;
    const wasFavorite = serverIds.includes(id);
    setPendingIds(current => [...current, id]);
    queryClient.setQueryData(['animal-favorites', user._id], (current: any) => ({
      ids: wasFavorite
        ? (current?.ids || []).filter((item: string) => item !== id)
        : [...(current?.ids || []), id],
      items: wasFavorite
        ? (current?.items || []).filter((item: any) => String(item._id || item.id) !== id)
        : current?.items || [],
    }));
    try {
      if (wasFavorite) await removeAnimalFavorite(id);
      else await addAnimalFavorite(id);
      await queryClient.invalidateQueries({ queryKey: ['animal-favorites', user._id] });
    } catch (error) {
      await queryClient.invalidateQueries({ queryKey: ['animal-favorites', user._id] });
      throw error;
    } finally {
      setPendingIds(current => current.filter(item => item !== id));
    }
  }, [pendingIds, queryClient, serverIds, user]);

  return {
    ids,
    items: query.data?.items || [],
    isLoading: Boolean(user) && query.isLoading,
    isFavorite: (id: string) => ids.includes(String(id)),
    isPending: (id: string) => pendingIds.includes(String(id)),
    toggle,
  };
}
