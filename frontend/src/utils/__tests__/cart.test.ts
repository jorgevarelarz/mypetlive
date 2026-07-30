import {
  addToCart,
  cartSubtotal,
  clearCart,
  getCart,
  removeFromCart,
  replaceCart,
  setQty,
} from '../cart';
import type { Product } from '../../api/marketplace';

// La regla de negocio del carrito es una sola y es la que más cara sale si se
// rompe: **un carrito, un vendedor**. Si aquí se cuela producto de dos tiendas,
// el checkout del servidor lo rechaza con `mixed_sellers` y la persona se queda
// sin entender por qué no puede pagar lo que ha metido.

const product = (id: string, extra: Partial<Product> = {}): Product => ({
  id,
  name: `Producto ${id}`,
  images: [],
  category: 'comida',
  species: [],
  priceEur: 10,
  stock: 10,
  listedBy: 'partner',
  seller: { id: 'tienda-1', name: 'Tienda Norte' },
  ...extra,
});

beforeEach(() => {
  localStorage.clear();
  clearCart();
});

describe('Carrito', () => {
  it('acumula unidades del mismo producto en vez de duplicar la línea', () => {
    addToCart(product('a'), 2);
    addToCart(product('a'), 3);

    const lines = getCart();
    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe(5);
  });

  it('no mezcla dos tiendas: avisa en vez de tirar lo que había', () => {
    addToCart(product('a'));

    const result = addToCart(product('b', { seller: { id: 'tienda-2', name: 'Tienda Sur' } }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('other_seller');
    // Lo importante: el carrito anterior sigue intacto.
    expect(getCart().map(line => line.productId)).toEqual(['a']);
  });

  it('tampoco mezcla lo nuestro con lo de una tienda', () => {
    addToCart(product('a', { listedBy: 'platform', seller: null }));
    const result = addToCart(product('b'));
    expect(result.ok).toBe(false);
    expect(getCart()).toHaveLength(1);
  });

  it('deja empezar de cero con el producto de la otra tienda', () => {
    addToCart(product('a'));
    replaceCart(product('b', { seller: { id: 'tienda-2', name: 'Tienda Sur' } }), 2);

    const lines = getCart();
    expect(lines).toHaveLength(1);
    expect(lines[0].productId).toBe('b');
    expect(lines[0].qty).toBe(2);
    expect(lines[0].sellerName).toBe('Tienda Sur');
  });

  it('sí junta varios productos de la misma tienda', () => {
    addToCart(product('a'));
    const result = addToCart(product('b'));
    expect(result.ok).toBe(true);
    expect(getCart()).toHaveLength(2);
  });

  it('suma el subtotal en céntimos para que no baile con los decimales', () => {
    addToCart(product('a', { priceEur: 19.99 }), 3);
    expect(cartSubtotal()).toBe(59.97);
  });

  it('respeta el tope de 20 unidades por línea que valida el servidor', () => {
    addToCart(product('a'), 15);
    addToCart(product('a'), 15);
    expect(getCart()[0].qty).toBe(20);

    setQty('a', 50);
    expect(getCart()[0].qty).toBe(20);
  });

  it('poner cero unidades quita la línea', () => {
    addToCart(product('a'), 2);
    setQty('a', 0);
    expect(getCart()).toHaveLength(0);
  });

  it('quitar y vaciar dejan el carrito utilizable', () => {
    addToCart(product('a'));
    addToCart(product('b'));
    removeFromCart('a');
    expect(getCart().map(line => line.productId)).toEqual(['b']);

    clearCart();
    expect(getCart()).toEqual([]);
    // Vaciado el carrito, ya se puede comprar en otra tienda.
    expect(addToCart(product('c', { seller: { id: 'tienda-2', name: 'Tienda Sur' } })).ok).toBe(true);
  });

  it('descarta la basura guardada en localStorage sin romperse', () => {
    localStorage.setItem('cart_v1', '{"no":"es un array"}');
    expect(getCart()).toEqual([]);

    localStorage.setItem('cart_v1', '[{"productId":"a","priceEur":"nope","qty":1},{"productId":"b","priceEur":5,"qty":1}]');
    expect(getCart().map(line => line.productId)).toEqual(['b']);
  });
});
