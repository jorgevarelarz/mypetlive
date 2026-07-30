// Reglas de dinero del marketplace.
//
// Conviven dos modos y NO se mezclan nunca en un mismo pedido, porque no son lo
// mismo ni fiscal ni legalmente:
//
//   'partner'  — el producto lo lista una tienda dada de alta, con su precio.
//                Vende ella: el cobro va a su cuenta de Stripe (destination
//                charge) y nosotros retenemos una comisión (8% por defecto).
//                Factura la tienda al cliente; nosotros le facturamos la comisión.
//
//   'platform' — el producto lo listamos nosotros, con sobrecoste sobre el
//                precio del proveedor. Aquí **el vendedor somos nosotros**: el
//                cobro entra entero en nuestra cuenta y arrastra factura con IVA
//                al cliente, desistimiento a 14 días y garantía.
//
// El `listedBy` viaja congelado en cada pedido: cambiar el modo de un producto
// mañana no puede reescribir lo que pasó ayer.

export type ListedBy = 'partner' | 'platform';

function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

/** Comisión por pedido sobre productos de tienda. */
export const MARKETPLACE_COMMISSION_PCT = envNumber('MARKETPLACE_COMMISSION_PCT', 8);

/** Sobrecoste por defecto de lo que listamos nosotros, si no se fija precio a mano. */
export const MARKETPLACE_MARKUP_PCT = envNumber('MARKETPLACE_MARKUP_PCT', 15);

/** Gastos de envío de lo que enviamos nosotros. */
export const PLATFORM_SHIPPING_EUR = envNumber('MARKETPLACE_SHIPPING_EUR', 4.9);
export const PLATFORM_FREE_SHIPPING_FROM_EUR = envNumber('MARKETPLACE_FREE_SHIPPING_FROM_EUR', 49);

/** Tope de seguridad por pedido, en la línea de `utils/limits.ts`. */
export const ORDER_MAX_EUR = envNumber('MARKETPLACE_ORDER_MAX_EUR', 1500);

/** Euros → céntimos, que es la única unidad en la que Stripe y las sumas cuadran. */
export function cents(eur: number): number {
  return Math.round(eur * 100);
}

export function eur(centsValue: number): number {
  return Math.round(centsValue) / 100;
}

export type OrderLine = { name: string; priceEur: number; qty: number; costEur?: number };

export type OrderTotals = {
  subtotalEur: number;
  shippingEur: number;
  totalEur: number;
  /** Solo en 'partner': lo que retiene la plataforma. */
  commissionPct: number;
  commissionEur: number;
  /** Solo en 'platform': precio menos coste de proveedor. Informativo, no se cobra aparte. */
  platformMarginEur: number;
};

/**
 * Totales de un pedido.
 *
 * La comisión se calcula sobre el **subtotal de producto, no sobre el envío**:
 * el porte no es margen de la tienda y cobrar comisión sobre él sería cobrar por
 * el trabajo del transportista.
 */
export function orderTotals(
  lines: OrderLine[],
  { listedBy, shippingEur, commissionPct }: { listedBy: ListedBy; shippingEur: number; commissionPct?: number },
): OrderTotals {
  const subtotalCents = lines.reduce((acc, line) => acc + cents(line.priceEur) * Math.max(0, Math.floor(line.qty)), 0);
  const shippingCents = cents(Math.max(0, shippingEur));
  const pct = listedBy === 'partner' ? (commissionPct ?? MARKETPLACE_COMMISSION_PCT) : 0;
  const commissionCents = listedBy === 'partner' ? Math.round((subtotalCents * pct) / 100) : 0;
  const marginCents =
    listedBy === 'platform'
      ? lines.reduce(
          (acc, line) => acc + (cents(line.priceEur) - cents(line.costEur || 0)) * Math.max(0, Math.floor(line.qty)),
          0,
        )
      : 0;

  return {
    subtotalEur: eur(subtotalCents),
    shippingEur: eur(shippingCents),
    totalEur: eur(subtotalCents + shippingCents),
    commissionPct: pct,
    commissionEur: eur(commissionCents),
    platformMarginEur: eur(Math.max(0, marginCents)),
  };
}

/** Envío según el vendedor: gratis a partir del umbral que fije cada uno. */
export function shippingFor(
  subtotalEur: number,
  config: { shippingEur?: number; freeFromEur?: number },
): number {
  const base = config.shippingEur ?? PLATFORM_SHIPPING_EUR;
  const freeFrom = config.freeFromEur ?? PLATFORM_FREE_SHIPPING_FROM_EUR;
  if (freeFrom > 0 && subtotalEur >= freeFrom) return 0;
  return base;
}

/** Precio de venta de lo que listamos nosotros cuando solo se indica el coste. */
export function priceFromCost(costEur: number, markupPct = MARKETPLACE_MARKUP_PCT): number {
  return eur(Math.round(cents(costEur) * (1 + markupPct / 100)));
}
