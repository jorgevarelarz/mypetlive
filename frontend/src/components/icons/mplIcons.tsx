/**
 * Iconos de MyPetLive del paquete «MyPetLive_Assets_HD» (2 nov 2026, recreados en vectorial
 * a partir de la propuesta de la ficha de Toby). Generado desde iconos_svg/: 24×24, trazo 1,7.
 * Cada icono toma el color de `color` (por defecto, el suyo del paquete).
 */
import React from 'react';

type P = { size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties; className?: string };

function Base({ size = 24, color, strokeWidth = 1.7, style, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color, flexShrink: 0, ...style }} className={className}>
      {children}
    </svg>
  );
}

export const IconoAdoptar = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="M4.2 12c.8-1.5 2.5-2.2 3.9-1.6l1.6 1.2 1.6-1.2c1.4-.6 3.1.1 3.9 1.6.9 1.8 0 3.7-2 4.9l-3.5 2.2-3.5-2.2c-2-1.2-2.9-3.1-2-4.9Z"/><circle cx="5.9" cy="6.9" r="1"/><circle cx="9.5" cy="5.2" r="1"/><circle cx="13.2" cy="6.1" r="1"/><path d="M17.5 5v5m-2.5-2.5h5"/></Base>;
export const IconoAviso = ({ color = '#C64A2B', ...p }: P) => <Base color={color} {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7.8-3 9h18c0-1.2-3-2-3-9ZM10 21h4"/><path d="M12 2v1"/></Base>;
export const IconoBuscar = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></Base>;
export const IconoCalendario = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/><circle cx="12" cy="15" r="1.2"/><path d="m8.3 14 .5-.6m6.4 0 .5.6m-5.5-2 .4.7m2.8-.7-.4.7"/></Base>;
export const IconoCodigoQr = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M5.5 5.5h2v2h-2zM16.5 5.5h2v2h-2zM5.5 16.5h2v2h-2z" fill="currentColor" stroke="none"/><path d="M14 14h3v3h-3zM20 14v3h-2v3h3M14 20h2"/></Base>;
export const IconoComida = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M4 7h6M18 21V3c-3.5 2-4 5-4 9h4"/></Base>;
export const IconoCompartir = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.4 10.8 7.2-4.4M8.4 13.2l7.2 4.4"/></Base>;
export const IconoConfiguracion = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="M12 2.5 14 4l2.4-.5.8 2.4 2.5 1 .1 2.5 1.7 1.9-1.7 1.8-.1 2.6-2.5.9-.8 2.4-2.4-.4-2 1.4-2-1.4-2.4.4-.8-2.4-2.5-.9-.1-2.6-1.7-1.8 1.7-1.9.1-2.5 2.5-1 .8-2.4L10 4l2-1.5Z"/><circle cx="12" cy="11.5" r="3"/></Base>;
export const IconoConfirmar = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="m4 12 5 5L20 6"/></Base>;
export const IconoCorazon = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="M20 5.7c-2-2.2-5-2.2-7 0l-1 1-1-1c-2-2.2-5-2.2-7 0s-2 5.5 0 7.5L12 21l8-7.8c2-2 2-5.3 0-7.5Z"/></Base>;
export const IconoCuenco = ({ color = '#E5A63C', ...p }: P) => <Base color={color} {...p}><path d="M3.5 11h17l-2 8h-13l-2-8Z"/><path d="M5 11c1-4.4 13-4.4 14 0M7 15h10"/></Base>;
export const IconoCupones = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z"/><path d="M12 5v3m0 3v2m0 3v3" stroke-dasharray="1.5 1.7"/></Base>;
export const IconoDespensa = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2.5 4H5l2.8 12H19l2-9.5H6.3M8 13h12"/></Base>;
export const IconoEditar = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="m4 20 4.6-1 10.6-10.6a2.5 2.5 0 0 0-3.6-3.6L5 15.4 4 20Z"/><path d="m13.9 6.6 3.5 3.5"/></Base>;
export const IconoEtiqueta = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="M20 13 13 20a2 2 0 0 1-2.8 0L3 12.8V4h8.8L20 12a1.4 1.4 0 0 1 0 1Z"/><circle cx="7.5" cy="8" r="1.5"/></Base>;
export const IconoHuella = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><ellipse cx="6.3" cy="7.6" rx="1.5" ry="2.1" transform="rotate(-23 6.3 7.6)" fill="currentColor" stroke="none"/><ellipse cx="10.3" cy="4.9" rx="1.4" ry="2" transform="rotate(-5 10.3 4.9)" fill="currentColor" stroke="none"/><ellipse cx="14.6" cy="5.5" rx="1.4" ry="2" transform="rotate(12 14.6 5.5)" fill="currentColor" stroke="none"/><ellipse cx="18.3" cy="8.4" rx="1.4" ry="2" transform="rotate(25 18.3 8.4)" fill="currentColor" stroke="none"/><path d="M7.1 13.9c1.5-1.4 2.6-3.3 4.8-3.3s3.4 2.1 4.9 3.4c1.7 1.5 1.5 4.3-.4 5.2-1.7.8-2.8-.3-1.3-.5-2.2-.5-3.5 0-2.3 1.1-4.1.1-4.4-2.2-.1-1.1.4-2.1 1.4-2.8Z" fill="currentColor" stroke="none"/></Base>;
export const IconoInicio = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/></Base>;
export const IconoMasProducto = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V6a3 3 0 0 1 6 0v2M12 11v6m-3-3h6"/></Base>;
export const IconoMas = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="M12 4v16M4 12h16"/></Base>;
export const IconoMensajes = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="M21 11.5c0 4.7-4 8.5-9 8.5-1.6 0-3-.3-4.2-.9L3 20l1.3-4A8.1 8.1 0 0 1 3 11.5C3 6.8 7 3 12 3s9 3.8 9 8.5Z"/></Base>;
export const IconoMenu = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="M4 7h16M4 12h16M4 17h16"/></Base>;
export const IconoMonedaHuella = ({ color = '#E5A63C', ...p }: P) => <Base color={color} {...p}><circle cx="12" cy="12" r="9"/><circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="11" cy="8.3" r="1" fill="currentColor" stroke="none"/><circle cx="14.1" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="16.8" cy="11" r="1" fill="currentColor" stroke="none"/><path d="M9 14.5c1.2-1 1.7-2.1 3-2.1s1.8 1.1 3 2.1c1 1 0 3.1-1.7 2.2-1-.4-1.7-.4-2.6 0-1.7.9-2.7-1.2-1.7-2.2Z" fill="currentColor" stroke="none"/></Base>;
export const IconoPasaporte = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="M12 21c-2-1.5-4.3-2.2-9-2.2V4.5C7.8 4.3 10 5 12 6.5c2-1.5 4.2-2.2 9-2V18.8c-4.7 0-7 .7-9 2.2Z"/><path d="M12 6.5V21"/></Base>;
export const IconoPaseo = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><path d="M18.7 15.7c-2.2-2.7-4.6-2.4-6.5-.9l-3.9 3.4c-1.9 1.7-4.5-.7-2.7-2.7l5.5-5.5M11.1 10a5.2 5.2 0 1 1 7 2.1"/><path d="M18 12.3c1.2.9 1.7 1.9 1.4 3.5"/></Base>;
export const IconoPerdido = ({ color = '#C64A2B', ...p }: P) => <Base color={color} {...p}><path d="M20 10c0 5.3-8 11-8 11S4 15.3 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.7"/></Base>;
export const IconoPerfil = ({ color = '#006D68', ...p }: P) => <Base color={color} {...p}><circle cx="12" cy="7" r="4"/><path d="M4.5 21v-2.2c0-4 3.2-5.8 7.5-5.8s7.5 1.8 7.5 5.8V21"/></Base>;
export const IconoPerro = ({ color = '#E5A63C', ...p }: P) => <Base color={color} {...p}><path d="M4 15V9l3-2 3 2h5l2-4 3 2-2 4v5h-3v4h-3v-5H9v5H6v-5Z"/><path d="M7 7 5 4M19 11l2 2"/><circle cx="17" cy="8.6" r=".6" fill="currentColor" stroke="none"/></Base>;
export const IconoSalud = ({ color = '#C64A2B', ...p }: P) => <Base color={color} {...p}><path d="M20.6 5.7a5.3 5.3 0 0 0-7.5 0L12 6.8l-1.1-1.1a5.3 5.3 0 0 0-7.5 7.5L12 21l8.6-7.8a5.3 5.3 0 0 0 0-7.5Z"/><path d="M3.8 12h4l2.3-3.8 3.3 8 2.2-4.2h4.4"/></Base>;
