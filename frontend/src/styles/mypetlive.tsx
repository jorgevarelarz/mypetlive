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
  faint: '#98A088',
  border: '#E5E1D6',
  teal: '#1F6F6F',
  tealDark: '#176363',
  teal100: '#E2EEEC',
  coral: '#E8654A',
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

export const sexLabel = (value?: string) => {
  const labels: Record<string, string> = {
    female: 'Hembra',
    male: 'Macho',
  };
  return value ? labels[value] || value : '';
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
