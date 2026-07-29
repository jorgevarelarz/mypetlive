import { api as client } from './client';

export type ShopOption = {
  partnerId: string;
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
 * contar los clics: es el dato que decide si el marketplace merece construirse.
 */
export function shopClickUrl(partnerId: string, product: string, source: string, animalId?: string) {
  const params = new URLSearchParams({ product, src: source });
  if (animalId) params.set('animal', animalId);
  return `/api/shop/click/${partnerId}?${params.toString()}`;
}
