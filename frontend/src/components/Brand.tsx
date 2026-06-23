import React from 'react';

type Props = {
  size?: number; // font-size in px
  withIcon?: boolean;
};

/** Wordmark de marca MyPetLive: "MyPet" (teal) + "Live" (verde) + huella coral. */
export default function Brand({ size = 20, withIcon = true }: Props) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800, fontSize: size, letterSpacing: 0, lineHeight: 1 }}>
      {withIcon && (
        <svg width={size + 6} height={size + 6} viewBox="0 0 64 64" aria-hidden="true" style={{ flexShrink: 0 }}>
          <rect width="64" height="64" rx="15" fill="#1F6F6F" />
          <g fill="#FDFBF4">
            <ellipse cx="32" cy="41" rx="12.5" ry="9.5" />
            <ellipse cx="17.5" cy="29" rx="5" ry="6" />
            <ellipse cx="46.5" cy="29" rx="5" ry="6" />
            <ellipse cx="25" cy="20" rx="4.6" ry="5.6" />
            <ellipse cx="39" cy="20" rx="4.6" ry="5.6" />
          </g>
          <circle cx="49" cy="16" r="6" fill="#F2856D" />
        </svg>
      )}
      <span style={{ color: '#1F6F6F' }}>MyPet</span>
      <span style={{ color: '#6A7B4F', marginLeft: -2 }}>Live</span>
    </span>
  );
}
