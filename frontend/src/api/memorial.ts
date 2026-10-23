import { api as client } from './client';

// Mural «en su memoria» de una mascota fallecida (ver memorial.controller).

export type MemorialMedia = { url: string; kind: 'image' | 'video' };
export type MemorialMemory = { _id: string; month?: string; text: string; photo?: string };
export type MemorialFavorites = { food?: string; toy?: string; place?: string; nap?: string; nicknames?: string };
export type MemorialStat = { key: string; value: number; label: string };
export type MemorialMessage = {
  _id: string;
  name: string;
  text: string;
  status?: 'pending' | 'published' | 'private';
  createdAt: string;
};

export type Memorial = {
  active: boolean;
  diedAt: string | null;
  epitaph: string | null;
  epitaphBy: string | null;
  favorites: MemorialFavorites;
  media: MemorialMedia[];
  memories: MemorialMemory[];
  candles: number;
};

/** Lo que trae el pasaporte público cuando la mascota ha fallecido. */
export type PublicMemorial = Memorial & {
  stats: MemorialStat[];
  messages: MemorialMessage[];
  by: string | null;
  bornAt: string | null;
};

export async function startMemorial(id: string, diedAt?: string) {
  const { data } = await client.post(`/api/animals/${id}/memorial`, { diedAt: diedAt || undefined });
  return data as { ok: boolean; memorial: Memorial };
}

export async function stopMemorial(id: string) {
  const { data } = await client.delete(`/api/animals/${id}/memorial`);
  return data as { ok: boolean };
}

export async function getFamilyMemorial(id: string) {
  const { data } = await client.get(`/api/animals/${id}/memorial`);
  return data as { memorial: Memorial; stats: MemorialStat[]; messages: MemorialMessage[]; code: string | null };
}

export async function updateMemorial(
  id: string,
  patch: { epitaph?: string; epitaphBy?: string; diedAt?: string | null; favorites?: MemorialFavorites },
) {
  const { data } = await client.put(`/api/animals/${id}/memorial`, patch);
  return data as { ok: boolean; memorial: Memorial };
}

export async function addMemorialMedia(id: string, url: string) {
  const { data } = await client.post(`/api/animals/${id}/memorial/media`, { url });
  return data as { ok: boolean; memorial: Memorial };
}

export async function removeMemorialMedia(id: string, url: string) {
  const { data } = await client.delete(`/api/animals/${id}/memorial/media`, { data: { url } });
  return data as { ok: boolean; memorial: Memorial };
}

export async function addMemory(id: string, memory: { month?: string; text: string; photo?: string }) {
  const { data } = await client.post(`/api/animals/${id}/memorial/memories`, memory);
  return data as { ok: boolean; memorial: Memorial };
}

export async function removeMemory(id: string, memoryId: string) {
  const { data } = await client.delete(`/api/animals/${id}/memorial/memories/${memoryId}`);
  return data as { ok: boolean; memorial: Memorial };
}

export async function setMessageStatus(id: string, messageId: string, status: 'published' | 'private' | 'pending') {
  const { data } = await client.patch(`/api/animals/${id}/memorial/messages/${messageId}`, { status });
  return data as { ok: boolean };
}

export async function deleteMessage(id: string, messageId: string) {
  const { data } = await client.delete(`/api/animals/${id}/memorial/messages/${messageId}`);
  return data as { ok: boolean };
}

// Público, desde el QR.
export async function lightCandle(code: string) {
  const { data } = await client.post(`/api/animals/passport/${encodeURIComponent(code)}/candle`);
  return data as { ok: boolean; candles: number };
}

export async function leaveMemorialMessage(code: string, name: string, text: string) {
  const { data } = await client.post(`/api/animals/passport/${encodeURIComponent(code)}/memorial-message`, { name, text });
  return data as { ok: boolean };
}

/** Sube un vídeo (MP4/MOV, hasta 80 MB) y devuelve su URL. */
export async function uploadVideo(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/api/uploads/video', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return { url: data.url };
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «2014-03» → «Marzo de 2014». */
export function monthLabel(month?: string): string | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS[m - 1];
  return name ? `${name[0].toUpperCase()}${name.slice(1)} de ${y}` : null;
}

/** «28 de marzo de 2014». */
export function longDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}
