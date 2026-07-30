import { api as client } from './client';

// Cliente del marketplace. El catálogo es público; el resto necesita sesión,
// salvo el checkout y la consulta de un pedido con token, que son justo las dos
// cosas que un invitado tiene que poder hacer.

export type ProductCategory =
  | 'comida'
  | 'arena'
  | 'snacks'
  | 'higiene'
  | 'juguetes'
  | 'accesorios'
  | 'salud'
  | 'otros';

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'comida',
  'arena',
  'snacks',
  'higiene',
  'juguetes',
  'accesorios',
  'salud',
  'otros',
];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  comida: 'Comida',
  arena: 'Arena',
  snacks: 'Snacks',
  higiene: 'Higiene',
  juguetes: 'Juguetes',
  accesorios: 'Accesorios',
  salud: 'Salud',
  otros: 'Otros',
};

export type ProductSeller = { id: string; name: string; city?: string };

export type Product = {
  id: string;
  name: string;
  description?: string;
  images: string[];
  category: ProductCategory;
  species: string[];
  priceEur: number;
  stock: number;
  listedBy: 'partner' | 'platform';
  seller: ProductSeller | null;
  /** Solo en la ficha: los portes que cobra ese vendedor por este importe. */
  shippingEur?: number;
};

/** Lo que devuelve el panel de la tienda: su propio producto, con el coste si es nuestro. */
export type OwnProduct = {
  _id: string;
  listedBy: 'partner' | 'platform';
  sellerId?: string;
  name: string;
  description?: string;
  images: string[];
  category: ProductCategory;
  species: string[];
  priceEur: number;
  costEur?: number;
  stock: number;
  active: boolean;
};

export type OrderStatus = 'pending_payment' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Pendiente de pago',
  paid: 'Pagado, preparándose',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
};

export type ShippingAddress = {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  province?: string;
  country?: string;
};

export type Order = {
  _id: string;
  reference: string;
  listedBy: 'partner' | 'platform';
  sellerId?: string;
  buyer: { userId?: string; email: string; name: string; phone?: string };
  items: Array<{ productId: string; name: string; priceEur: number; qty: number }>;
  shippingAddress: ShippingAddress;
  subtotalEur: number;
  shippingEur: number;
  totalEur: number;
  commissionPct: number;
  commissionEur: number;
  status: OrderStatus;
  tracking?: { carrier?: string; code?: string; shippedAt?: string };
  createdAt: string;
  paidAt?: string;
};

export type ProductFilters = {
  q?: string;
  category?: string;
  species?: string;
  seller?: string;
  page?: number;
};

export async function listProducts(filters: ProductFilters = {}) {
  const params: Record<string, string | number> = {};
  if (filters.q) params.q = filters.q;
  if (filters.category) params.category = filters.category;
  if (filters.species) params.species = filters.species;
  if (filters.seller) params.seller = filters.seller;
  if (filters.page) params.page = filters.page;
  const { data } = await client.get('/api/marketplace/products', { params });
  return data as { items: Product[]; page: number; limit: number; total: number };
}

export async function getProduct(id: string) {
  const { data } = await client.get(`/api/marketplace/products/${id}`);
  return data as Product;
}

// ------------------------------------------------------------------- compra

export type CheckoutPayload = {
  items: Array<{ productId: string; qty: number }>;
  shippingAddress: ShippingAddress;
  /** Solo los necesita un invitado: con sesión se leen de la cuenta. */
  email?: string;
  name?: string;
  phone?: string;
};

export type CheckoutResult = {
  orderId: string;
  reference?: string;
  /** URL de Stripe. Si falta, el pedido está creado pero no se pudo cobrar. */
  url?: string;
  guestToken?: string;
  error?: string;
};

export async function createCheckout(payload: CheckoutPayload): Promise<CheckoutResult> {
  const { data } = await client.post('/api/marketplace/checkout', payload);
  return data as CheckoutResult;
}

export async function getOrder(id: string, token?: string) {
  const { data } = await client.get(`/api/marketplace/orders/${id}`, {
    params: token ? { token } : undefined,
  });
  return data as Order;
}

export async function myOrders() {
  const { data } = await client.get('/api/marketplace/orders');
  return (data as { items: Order[] }).items;
}

// ------------------------------------------------------------ panel tienda

export async function myProducts() {
  const { data } = await client.get('/api/marketplace/mine');
  return (data as { items: OwnProduct[] }).items;
}

export async function saveProduct(product: Partial<OwnProduct> & { id?: string }) {
  const { data } = await client.post('/api/marketplace/products', product);
  return data as { ok: boolean; product: OwnProduct };
}

export async function deleteProduct(id: string) {
  const { data } = await client.delete(`/api/marketplace/products/${id}`);
  return data as { ok: boolean; retired?: boolean; deleted?: boolean };
}

export async function sellerOrders() {
  const { data } = await client.get('/api/marketplace/seller/orders');
  return (data as { items: Order[] }).items;
}

export async function markShipped(id: string, tracking: { carrier?: string; code?: string }) {
  const { data } = await client.post(`/api/marketplace/orders/${id}/ship`, tracking);
  return data as { ok: boolean; status: OrderStatus; tracking?: Order['tracking'] };
}

/**
 * Portes de la tienda: sin esto no se puede vender con envío.
 *
 * Va por el PATCH del perfil, que hace merge: solo se manda `marketplace` para
 * no arrastrar el resto del perfil desde una pantalla que no lo edita.
 */
export async function saveShippingConfig(
  userId: string,
  config: { shippingEur: number; freeFromEur?: number | null },
) {
  const { data } = await client.patch(`/api/users/${userId}`, { profile: { marketplace: config } });
  return data;
}
