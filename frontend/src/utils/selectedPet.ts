// Mascota elegida cuando el usuario tiene varias. La comparten el inicio y
// «Mi mascota» para que, al cambiar en una, la otra enseñe la misma. Solo es
// una comodidad del dispositivo: si no hay valor o no es suyo, se usa la primera.
const KEY = 'mpl.selectedPet';

export function loadSelectedPet(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveSelectedPet(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // Almacenamiento bloqueado: se pierde la preferencia, nada más.
  }
}
