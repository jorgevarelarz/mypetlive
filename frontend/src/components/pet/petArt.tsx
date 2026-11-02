/**
 * Colores y detalles de la pantalla «Mi mascota» (propuesta de Jorge, 2 nov 2026). Los iconos
 * están en components/icons/calcados.tsx (calcados de las maquetas) y mplIcons.tsx.
 */
import React from 'react';

export const PET_COLORS = {
  teal: '#006D68',
  tealButton: '#006D68',
  tealSoft: '#E4EFEC',
  coral: '#C64A2B',
  coralSoft: '#FBE7E1',
  gold: '#E5A63C',
  goldSoft: '#F3D9A4',
  ink: '#224540',
  muted: '#6B7464',
  border: '#ECE5DA',
  card: '#FFFDFA',
  inner: '#FAF6F0',
};

/** Huella: cuatro dedos y la almohadilla. */
export function PawGlyph({ size = 24, color = 'currentColor', style }: { size?: number; color?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={style}>
      <g fill={color}>
        <ellipse cx="6.2" cy="9.4" rx="2.1" ry="2.6" transform="rotate(-18 6.2 9.4)" />
        <ellipse cx="10" cy="5.6" rx="2.1" ry="2.7" transform="rotate(-6 10 5.6)" />
        <ellipse cx="14.4" cy="5.6" rx="2.1" ry="2.7" transform="rotate(6 14.4 5.6)" />
        <ellipse cx="18.1" cy="9.4" rx="2.1" ry="2.6" transform="rotate(18 18.1 9.4)" />
        <path d="M12.2 11.2c-2.6 0-5.4 3.1-5.4 5.6 0 1.8 1.3 2.7 2.9 2.7 1 0 1.6-.5 2.5-.5s1.5.5 2.5.5c1.6 0 2.9-.9 2.9-2.7 0-2.5-2.8-5.6-5.4-5.6z" />
      </g>
    </svg>
  );
}

/** Tres trazos de «brillo» junto a un nombre o un dibujo. */
export function Sparkle({ color = PET_COLORS.gold, size = 26, style }: { color?: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden style={style}>
      <g stroke={color} strokeWidth="2.6" strokeLinecap="round">
        <path d="M4 12l3-7" />
        <path d="M10 15l7-5" />
        <path d="M11 22l9-1" />
      </g>
    </svg>
  );
}

/** Cupón dorado con una huella (tarjeta de cupones del inicio), inclinado como en la maqueta. */
export function CouponArt({ width = 120 }: { width?: number }) {
  return (
    <svg width={width} height={width * 0.72} viewBox="0 0 120 86" aria-hidden>
      <defs>
        <linearGradient id="cuponOro" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FCE3A0" />
          <stop offset=".55" stopColor="#F4C462" />
          <stop offset="1" stopColor="#E9A93C" />
        </linearGradient>
      </defs>
      <g transform="rotate(-14 60 43)">
        <path
          d="M18 22h84a6 6 0 0 1 6 6v8a7 7 0 0 0 0 14v8a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6v-8a7 7 0 0 0 0-14v-8a6 6 0 0 1 6-6z"
          fill="url(#cuponOro)" stroke="#D9952E" strokeWidth="2.4" strokeLinejoin="round"
        />
        <path d="M34 26v34" stroke="#D9952E" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />
        <g transform="translate(55 28) scale(1.25)" fill="#E07A2E">
          <ellipse cx="6.2" cy="9.4" rx="2.1" ry="2.6" transform="rotate(-18 6.2 9.4)" />
          <ellipse cx="10" cy="5.6" rx="2.1" ry="2.7" transform="rotate(-6 10 5.6)" />
          <ellipse cx="14.4" cy="5.6" rx="2.1" ry="2.7" transform="rotate(6 14.4 5.6)" />
          <ellipse cx="18.1" cy="9.4" rx="2.1" ry="2.6" transform="rotate(18 18.1 9.4)" />
          <path d="M12.2 11.2c-2.6 0-5.4 3.1-5.4 5.6 0 1.8 1.3 2.7 2.9 2.7 1 0 1.6-.5 2.5-.5s1.5.5 2.5.5c1.6 0 2.9-.9 2.9-2.7 0-2.5-2.8-5.6-5.4-5.6z" />
        </g>
      </g>
    </svg>
  );
}
