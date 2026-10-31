import { api } from '../api/client';

export interface PublicStats {
  protectoras: number;
  animales: number;
  adopciones: number;
  donadoEur: number;
  patitas: number;
}

export async function getPublicStats(): Promise<PublicStats> {
  const { data } = await api.get('/api/stats/public');
  return data as PublicStats;
}
