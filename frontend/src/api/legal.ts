import { api } from '../api/client';

// 'legal-notice' y 'cookies' son informativos: se leen pero no se aceptan.
export type LegalSlug = 'terms' | 'privacy' | 'tenant-pro-consent' | 'legal-notice' | 'cookies';

export interface LegalDoc {
  slug: LegalSlug;
  version: string;
  content: string;
  createdAt?: string;
}

export interface LegalStatusEntry {
  latest: LegalDoc | null;
  acceptedVersion: string | null;
  acceptedAt: string | null;
}

export interface LegalStatus {
  terms: LegalStatusEntry;
  privacy: LegalStatusEntry;
}

export async function getLegalDoc(slug: LegalSlug): Promise<LegalDoc> {
  const { data } = await api.get(`/api/legal/${slug}`);
  return data as LegalDoc;
}

export async function listLegalVersions(slug: LegalSlug): Promise<LegalDoc[]> {
  const { data } = await api.get(`/api/legal/admin/${slug}`);
  return (data?.items || []) as LegalDoc[];
}

export async function createLegalDoc(slug: LegalSlug, version: string, content: string) {
  await api.post(`/api/legal/admin/${slug}`, { version, content });
}

export async function getLegalStatus(): Promise<LegalStatus> {
  const { data } = await api.get('/api/legal/status');
  return data as LegalStatus;
}

export async function acceptLegal(slug: 'terms' | 'privacy', version: string) {
  await api.post('/api/legal/accept', { slug, version });
}
