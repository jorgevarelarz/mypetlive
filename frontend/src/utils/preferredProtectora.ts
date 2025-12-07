export type PreferredProtectora = {
  id: string;
  name: string;
};

const STORAGE_KEY = 'preferred_protectora';

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadPreferredProtectora(): PreferredProtectora | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string' && typeof parsed.name === 'string') {
      return { id: parsed.id, name: parsed.name };
    }
    return null;
  } catch {
    return null;
  }
}

export function savePreferredProtectora(value: PreferredProtectora | null) {
  if (!isBrowser()) return;
  if (!value) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}
