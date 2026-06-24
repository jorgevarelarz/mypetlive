const KEY = 'favorites_v1';
export const FAVORITES_EVENT = 'mypetlive:favorites';

export function getFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function isFavorite(id: string): boolean {
  return getFavorites().includes(String(id));
}

export function toggleFavorite(id: string): string[] {
  const s = String(id);
  const list = new Set(getFavorites());
  if (list.has(s)) list.delete(s); else list.add(s);
  const arr = Array.from(list);
  localStorage.setItem(KEY, JSON.stringify(arr));
  window.dispatchEvent(new CustomEvent(FAVORITES_EVENT, { detail: arr }));
  return arr;
}

export function clearLocalFavorites() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(FAVORITES_EVENT, { detail: [] }));
}
