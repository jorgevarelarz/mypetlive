/**
 * Escapa texto para meterlo en HTML (correos). Nombres de mascota, productos,
 * tiendas o correos los escriben usuarios: sin esto, una protectora podía meter
 * enlaces o marcado en el correo que recibe el adoptante (RentalApp d900292).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
