import { User } from '../models/user.model';
import { Coupon } from '../models/coupon.model';
import { normalizeItemText } from './purchases';

// "Dónde comprarlo": qué partners tienen en su catálogo el producto que se le
// está acabando a una mascota, y a qué precio.
//
// No hay catálogo global que mantener: se usa el que las tiendas **ya** cargan
// para su TPV (`profile.itemCatalog`). Si una tienda no lo mantiene, no aparece,
// que es el incentivo correcto.
//
// Esto es el primer peldaño del marketplace: antes de montar carrito, pagos y
// logística, mide si alguien pincha. El casado es el mismo que el de las ofertas
// por items (minúsculas, sin acentos, por subcadena) para que "pienso" case con
// "Pienso cachorro 3 kg".

export type ShopOption = {
  partnerId: string;
  partnerName: string;
  city?: string;
  item: string;
  priceEur?: number;
  /** Cupón activo de ese partner que casa con el producto, si lo hay. */
  coupon?: { id: string; title?: string; discount?: string };
};

function matchesProduct(itemName: string, product: string): boolean {
  const item = normalizeItemText(itemName);
  const wanted = normalizeItemText(product);
  if (!item || !wanted) return false;
  if (item.includes(wanted) || wanted.includes(item)) return true;
  // "Acana Adult" contra "Acana Adult Pollo 6kg": basta con que compartan la
  // primera palabra significativa, que es la marca.
  const [brand] = wanted.split(' ');
  return brand.length >= 4 && item.includes(brand);
}

/**
 * Partners que venden `product`, ordenados por precio (los que no lo publican,
 * al final: un precio conocido vale más que uno por preguntar).
 */
export async function findWhereToBuy(product: string, limit = 5): Promise<ShopOption[]> {
  const wanted = normalizeItemText(product);
  if (!wanted) return [];

  // El filtro fino se hace en memoria porque el casado es laxo; el grueso
  // —tener catálogo— lo hace Mongo para no traerse todos los usuarios.
  const partners = await User.find({
    role: { $in: ['store', 'pro'] },
    'profile.itemCatalog.0': { $exists: true },
  })
    .select('name profile.itemCatalog profile.address.city')
    .limit(200)
    .lean();

  const options: ShopOption[] = [];
  for (const partner of partners as any[]) {
    const item = (partner.profile?.itemCatalog || []).find((entry: any) => matchesProduct(entry?.name || '', product));
    if (!item) continue;
    options.push({
      partnerId: String(partner._id),
      partnerName: partner.name,
      city: partner.profile?.address?.city,
      item: item.name,
      priceEur: typeof item.priceEur === 'number' ? item.priceEur : undefined,
    });
  }

  options.sort((a, b) => {
    if (a.priceEur === undefined) return 1;
    if (b.priceEur === undefined) return -1;
    return a.priceEur - b.priceEur;
  });

  const top = options.slice(0, limit);
  if (!top.length) return top;

  // Un cupón del mismo partner que case con el producto hace la diferencia entre
  // "aquí lo tienen" y "aquí te sale más barato".
  const coupons = await Coupon.find({
    partnerId: { $in: top.map(o => o.partnerId) },
    active: true,
  })
    .select('partnerId title discount targetItems')
    .lean();

  for (const option of top) {
    const coupon = (coupons as any[]).find(
      c =>
        String(c.partnerId) === option.partnerId &&
        (!c.targetItems?.length || c.targetItems.some((t: string) => matchesProduct(option.item, t))),
    );
    if (coupon) {
      option.coupon = { id: String(coupon._id), title: coupon.title, discount: coupon.discount };
    }
  }

  return top;
}
