// Token de un enlace de correo (restablecer contraseña, confirmar email, pedido
// de invitado). Va detrás de '#' (`/reset#token=…`) porque esa parte de la URL
// no sale del navegador: no llega a los logs del servidor ni a la cabecera
// Referer. Se acepta también `?token=` para los enlaces de correos ya enviados.
export function readUrlToken(hash: string = window.location.hash, search: string = window.location.search): string {
  const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  if (fromHash) return fromHash;
  return new URLSearchParams(search).get('token') || '';
}

// Copia local del token del pedido de invitado. Si al volver de Stripe el
// fragmento se perdiera por el camino, el pedido se sigue abriendo en este
// navegador. Un fallo de almacenamiento (modo privado) no debe romper la compra.
const orderKey = (orderId: string) => `mpl-order-token-${orderId}`;

export function rememberOrderToken(orderId: string, token?: string) {
  if (!token) return;
  try { window.localStorage.setItem(orderKey(orderId), token); } catch { /* sin almacenamiento */ }
}

export function storedOrderToken(orderId: string): string {
  try { return window.localStorage.getItem(orderKey(orderId)) || ''; } catch { return ''; }
}
