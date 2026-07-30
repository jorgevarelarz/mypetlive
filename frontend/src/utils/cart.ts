import type { Product } from '../api/marketplace';

// Carrito del marketplace.
//
// Vive en localStorage y no en el servidor a propósito: se puede comprar sin
// cuenta, así que un carrito en la base necesitaría una sesión anónima que no
// existe. Lo que decide el precio de verdad es el servidor al pagar; esto es
// solo lo que el usuario ha ido apuntando.
//
// **Un carrito, un vendedor.** Es la misma regla que el pedido en el servidor
// (`mixed_sellers`): con envío, dos tiendas son dos paquetes, dos portes y dos
// responsables. Aquí se aplica antes para no dejar que alguien llene el carrito
// y se lo tumbe el checkout.

const KEY = 'cart_v1';
export const CART_EVENT = 'mypetlive:cart';

export type CartLine = {
  productId: string;
  name: string;
  priceEur: number;
  qty: number;
  image?: string;
  /** Vendedor de la línea: `null` cuando vendemos nosotros. */
  sellerId: string | null;
  sellerName: string | null;
};

/** Clave de vendedor: lo que tiene que coincidir en todo el carrito. */
export function sellerKeyOf(line: Pick<CartLine, 'sellerId'>): string {
  return line.sellerId || 'platform';
}

function write(lines: CartLine[]): CartLine[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Modo privado o cuota llena: se pierde el carrito, no la sesión.
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: lines }));
  return lines;
}

export function getCart(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (line: any) => line && typeof line.productId === 'string' && Number.isFinite(Number(line.priceEur)),
    );
  } catch {
    return [];
  }
}

export function cartCount(lines = getCart()): number {
  return lines.reduce((acc, line) => acc + line.qty, 0);
}

export function cartSubtotal(lines = getCart()): number {
  const cents = lines.reduce((acc, line) => acc + Math.round(line.priceEur * 100) * line.qty, 0);
  return cents / 100;
}

export type AddResult = { ok: true; lines: CartLine[] } | { ok: false; reason: 'other_seller'; lines: CartLine[] };

/**
 * Añade un producto. Si el carrito es de otra tienda no lo mezcla: devuelve
 * `other_seller` para que la pantalla pregunte antes de tirar lo que había.
 */
export function addToCart(product: Product, qty = 1): AddResult {
  const lines = getCart();
  const incoming: CartLine = {
    productId: product.id,
    name: product.name,
    priceEur: product.priceEur,
    qty: Math.max(1, Math.min(20, Math.floor(qty) || 1)),
    image: product.images?.[0],
    sellerId: product.seller?.id || null,
    sellerName: product.seller?.name || null,
  };

  if (lines.length && sellerKeyOf(lines[0]) !== sellerKeyOf(incoming)) {
    return { ok: false, reason: 'other_seller', lines };
  }

  const existing = lines.find(line => line.productId === incoming.productId);
  if (existing) {
    existing.qty = Math.min(20, existing.qty + incoming.qty);
    return { ok: true, lines: write(lines) };
  }
  return { ok: true, lines: write([...lines, incoming]) };
}

/** Vacía el carrito y empieza uno nuevo con este producto. */
export function replaceCart(product: Product, qty = 1): CartLine[] {
  write([]);
  const result = addToCart(product, qty);
  return result.lines;
}

export function setQty(productId: string, qty: number): CartLine[] {
  const next = Math.max(0, Math.min(20, Math.floor(qty) || 0));
  if (next === 0) return removeFromCart(productId);
  return write(getCart().map(line => (line.productId === productId ? { ...line, qty: next } : line)));
}

export function removeFromCart(productId: string): CartLine[] {
  return write(getCart().filter(line => line.productId !== productId));
}

export function clearCart(): CartLine[] {
  return write([]);
}

/** Lo que espera el checkout del servidor. */
export function checkoutItems(lines = getCart()) {
  return lines.map(line => ({ productId: line.productId, qty: line.qty }));
}
