import React from 'react';

export const MPL_FONT_DISPLAY = "'Bricolage Grotesque', sans-serif";
export const MPL_FONT_BODY = "'Hanken Grotesk', sans-serif";
export const MPL_FONT_MONO = "'JetBrains Mono', monospace";

export const MPL = {
  bg: '#F6F3EC',
  panel: '#EFEADF',
  card: '#FFFFFF',
  ink: '#3F4A3C',
  muted: '#6B7464',
  faint: '#6B7464',
  border: '#E5E1D6',
  teal: '#1F6F6F',
  tealDark: '#176363',
  teal100: '#E2EEEC',
  coral: '#C0512F',
  coralDark: '#C0512F',
  coral100: '#FBE7E0',
  olive: '#6A7B4F',
  oliveDark: '#566A3D',
  olive100: '#ECEFE2',
  gold: '#E9A93C',
  goldDark: '#A77B1C',
  gold100: '#FBEFD4',
};

export function PawMark({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} style={{ display: 'block', color }} aria-hidden="true">
      <ellipse cx="24" cy="32" rx="11" ry="8.5" fill="currentColor" />
      <circle cx="11" cy="23" r="4.6" fill="currentColor" />
      <circle cx="19.5" cy="15" r="5" fill="currentColor" />
      <circle cx="28.5" cy="15" r="5" fill="currentColor" />
      <circle cx="37" cy="23" r="4.6" fill="currentColor" />
    </svg>
  );
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: MPL.ink }}>
      <span style={{ color: MPL.teal, display: 'inline-flex' }}>
        <PawMark size={compact ? 20 : 24} />
      </span>
      <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: compact ? 18 : 20, fontWeight: 800 }}>
        MyPet<span style={{ color: MPL.coral }}>Live</span>
      </span>
    </span>
  );
}

export const speciesLabel = (value?: string) => {
  const labels: Record<string, string> = {
    dog: 'Perro',
    perro: 'Perro',
    cat: 'Gato',
    gato: 'Gato',
    // `normalizeSpecies` solo canoniza perro/gato: el resto llega tal cual desde
    // el alta de mascota personal (rabbit, bird, other).
    rabbit: 'Conejo',
    conejo: 'Conejo',
    bird: 'Ave',
    ave: 'Ave',
    reptile: 'Reptil',
    reptil: 'Reptil',
    other: 'Otro',
    otro: 'Otro',
  };
  return value ? labels[String(value).toLowerCase()] || value : '';
};

export const sizeLabel = (value?: string) => {
  const labels: Record<string, string> = {
    small: 'Pequeño',
    medium: 'Mediano',
    large: 'Grande',
  };
  return value ? labels[value] || value : '';
};

// `ageGroup` del modelo (puppy/young/adult/senior): otro vocabulario en inglés
// que no puede pintarse crudo en la ficha.
export const ageGroupLabel = (value?: string) => {
  const labels: Record<string, string> = {
    puppy: 'Cachorro',
    young: 'Joven',
    adult: 'Adulto',
    senior: 'Senior',
  };
  return value ? labels[value] || value : '';
};

export const sexLabel = (value?: string) => {
  const labels: Record<string, string> = {
    female: 'Hembra',
    male: 'Macho',
  };
  return value ? labels[value] || value : '';
};

export const moodLabel = (value?: string | null) => {
  const labels: Record<string, string> = {
    relajado: 'Tranquilo',
    timido: 'Tímido',
    energico: 'Enérgico',
    en_adaptacion: 'En adaptación',
    carinoso: 'Cariñoso',
    independiente: 'Independiente',
  };
  return value ? labels[String(value).toLowerCase()] || value : '';
};

// Quién usa arenero: gatos y conejos. Los conejos estaban fuera por descuido —el
// backend sí los contempla (`markLitter` solo rechaza a los perros), así que la
// interfaz le negaba a una familia con conejo algo que el servidor le permitía.
// Los perros no, y las aves y "otros" tampoco: para eso está la comida, que es
// lo único común a todas las especies.
export const usesLitter = (species?: string) => {
  const canonical: Record<string, string> = {
    cat: 'cat', gato: 'cat',
    rabbit: 'rabbit', conejo: 'rabbit', conejillo: 'rabbit',
  };
  return Boolean(canonical[String(species || '').trim().toLowerCase()]);
};

// El simétrico del arenero: a un perro se le ofrece "marcar paseo" en el mismo
// hueco en el que un gato tiene "cambiar arena". El resto de especies se quedan
// solo con la comida, que es lo único común a todas.
export const usesWalks = (species?: string) => {
  const canonical: Record<string, string> = { dog: 'dog', perro: 'dog' };
  return canonical[String(species || '').trim().toLowerCase()] === 'dog';
};

// Intensidad del paseo (`WALK_KINDS` del backend). El valor viaja en clave; el
// icono y la etiqueta viven aquí porque son decisión de la interfaz.
export const WALK_KIND_OPTIONS: Array<{ value: string; label: string; icon: string; hint: string }> = [
  { value: 'suave', label: 'Paseo suave', icon: '🌿', hint: 'Tranquilo, para hacer sus cosas' },
  { value: 'largo', label: 'Paseo largo', icon: '🚶', hint: 'Vuelta larga, sin prisa' },
  { value: 'corriendo', label: 'Corriendo', icon: '💨', hint: 'A ritmo, para quemar energía' },
  { value: 'senderismo', label: 'Senderismo', icon: '⛰️', hint: 'Ruta o monte' },
];

export const walkKindLabel = (value?: string) =>
  WALK_KIND_OPTIONS.find(o => o.value === value)?.label || value || 'Paseo';

// Categorías de `healthHistory[].type` (HEALTH_CATEGORIES del backend), que se
// guardan en inglés y no pueden pintarse crudas en el historial de salud.
export const healthCategoryLabel = (value?: string) => {
  const labels: Record<string, string> = {
    visit: 'Visita / consulta',
    vaccine: 'Vacuna',
    deworming: 'Desparasitación',
    medication: 'Medicación',
    checkup: 'Revisión',
    surgery: 'Cirugía',
    test: 'Prueba / analítica',
    other: 'Otro',
  };
  return value ? labels[String(value).toLowerCase()] || value : 'Hito de salud';
};

export const MEDICATION_FREQUENCY_OPTIONS = [
  { value: 'every_6h', label: 'Cada 6 horas' },
  { value: 'every_8h', label: 'Cada 8 horas' },
  { value: 'every_12h', label: 'Cada 12 horas' },
  { value: 'daily', label: 'Una vez al día' },
  { value: 'every_2_days', label: 'Cada 2 días' },
  { value: 'weekly', label: 'Una vez a la semana' },
  { value: 'monthly', label: 'Una vez al mes' },
  { value: 'as_needed', label: 'Solo si lo necesita' },
] as const;

/** «1 comprimido · cada 12 horas · hasta el 12 nov»; vacío si la entrada no tiene pauta. */
export const medicationSummary = (e: { dose?: string; frequency?: string; endsAt?: string | Date | null }) => {
  const frecuencia = MEDICATION_FREQUENCY_OPTIONS.find(o => o.value === e.frequency)?.label.toLowerCase();
  const hasta = e.endsAt ? `hasta el ${new Date(e.endsAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')}` : '';
  return [e.dose, frecuencia, hasta].filter(Boolean).join(' · ');
};

export const statusLabel = (value?: string) => {
  const labels: Record<string, string> = {
    borrador: 'Borrador',
    publicado: 'Publicado',
    reservado: 'Reservado',
    preadoptado: 'Preadoptado',
    adoptado: 'Adoptado',
    no_disponible: 'No disponible',
    archivado: 'Archivado',
  };
  return value ? labels[value] || value : '';
};
