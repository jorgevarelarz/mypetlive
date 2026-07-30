import { useCallback, useEffect, useState } from 'react';
import type { Product } from '../api/marketplace';
import {
  CART_EVENT,
  type AddResult,
  type CartLine,
  addToCart,
  cartCount,
  cartSubtotal,
  clearCart,
  getCart,
  removeFromCart,
  replaceCart,
  setQty,
} from '../utils/cart';

/**
 * Carrito compartido entre pantallas. Se sincroniza por el evento propio (misma
 * pestaña) y por `storage` (otras pestañas): sin lo segundo, comprar en una
 * pestaña dejaría a la otra mostrando un carrito que ya no existe.
 */
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(getCart);

  useEffect(() => {
    const sync = () => setLines(getCart());
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const add = useCallback((product: Product, qty = 1): AddResult => {
    const result = addToCart(product, qty);
    setLines(result.lines);
    return result;
  }, []);

  const replace = useCallback((product: Product, qty = 1) => {
    setLines(replaceCart(product, qty));
  }, []);

  const update = useCallback((productId: string, qty: number) => {
    setLines(setQty(productId, qty));
  }, []);

  const remove = useCallback((productId: string) => {
    setLines(removeFromCart(productId));
  }, []);

  const clear = useCallback(() => {
    setLines(clearCart());
  }, []);

  return {
    lines,
    count: cartCount(lines),
    subtotalEur: cartSubtotal(lines),
    sellerName: lines[0]?.sellerName || null,
    sellerId: lines[0]?.sellerId || null,
    add,
    replace,
    update,
    remove,
    clear,
  };
}
