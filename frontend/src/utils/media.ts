import { API_BASE } from '../api/client';

export function toAbsoluteUrl(u?: string): string {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const base =
    API_BASE ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const normalizedBase = base.replace(/\/$/, '');
  return `${normalizedBase}${u.startsWith('/') ? '' : '/'}${u}`;
}
