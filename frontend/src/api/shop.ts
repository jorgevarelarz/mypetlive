import { api as client } from './client';

export type ShopOption = {
  /** `marketplace` se puede comprar ya; `catalog` solo dice que la tienda lo tiene. */
  source: 'marketplace' | 'catalog';
  productId?: string;
  /** Ausente cuando lo vendemos nosotros: no hay tienda detrás. */
  partnerId?: string;
  partnerName: string;
  city?: string;
  item: string;
  priceEur?: number;
  coupon?: { id: string; title?: string; discount?: string };
};

/** Tiendas de la red que tienen ese producto en el catálogo de su TPV. */
export async function whereToBuy(product: string) {
  const { data } = await client.get('/api/shop/where-to-buy', { params: { product } });
  return data as { product: string; options: ShopOption[] };
}

/**
 * Enlace medido a una tienda. Pasa por el redirector del servidor para poder
 * contar los clics: es el dato que dice si esto le sirve a alguien.
 */
export function shopClickUrl(partnerId: string, product: string, source: string, animalId?: string) {
  const params = new URLSearchParams({ product, src: source });
  if (animalId) params.set('animal', animalId);
  return `/api/shop/click/${partnerId}?${params.toString()}`;
}

/**
 * Enlace medido a un producto comprable: lleva a su ficha en la tienda.
 *
 * Este clic vale más que el anterior como señal — es intención de compra y no
 * curiosidad—, así que se cuenta aparte por `productId`.
 */
export function productClickUrl(productId: string, product: string, source: string, animalId?: string) {
  const params = new URLSearchParams({ product, src: source });
  if (animalId) params.set('animal', animalId);
  return `/api/shop/click/product/${productId}?${params.toString()}`;
}

/** El enlace que toca según de dónde salga la opción. */
export function optionClickUrl(option: ShopOption, product: string, source: string, animalId?: string) {
  return option.source === 'marketplace' && option.productId
    ? productClickUrl(option.productId, product, source, animalId)
    : shopClickUrl(option.partnerId || '', product, source, animalId);
}
