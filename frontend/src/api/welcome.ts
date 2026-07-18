import { api as client } from './client';

export type WelcomeTask = {
  key: string;
  title: string;
  description: string;
  link?: string;
  done: boolean;
  doneAt?: string | null;
};

export type WelcomePlan = {
  id: string;
  animalId: string;
  activatedAt: string;
  tasks: WelcomeTask[];
  progress: { done: number; total: number };
};

// Plan de bienvenida post-adopción de una mascota del usuario (404 si no hay).
export async function getWelcomePlan(animalId: string) {
  const { data } = await client.get(`/api/welcome/${encodeURIComponent(animalId)}`);
  return data as WelcomePlan;
}

export async function toggleWelcomeTask(animalId: string, key: string) {
  const { data } = await client.post(`/api/welcome/${encodeURIComponent(animalId)}/tasks/${encodeURIComponent(key)}`);
  return data as WelcomePlan;
}
