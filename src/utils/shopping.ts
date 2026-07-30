import { User } from '../models/user.model';
import { Coupon } from '../models/coupon.model';
import { Product } from '../models/product.model';
import { normalizeItemText } from './purchases';

// "Dónde comprarlo": dónde conseguir el producto que se le está acabando a una
// mascota, y a qué precio.
//
// Hay **dos fuentes**, y la diferencia entre ellas es la que le importa a quien
// se ha quedado sin pienso:
//
//   - `marketplace` — productos del catálogo real (`products`). Tienen stock y
//     se pueden **comprar ahora mismo**, con envío.
//   - `catalog` — la lista que las tiendas cargan para su TPV
//     (`profile.itemCatalog`). Solo dice "esto lo tengo": ni stock ni compra.
//
// Lo comprable va primero a propósito. No es un favor a nuestro marketplace: el
// producto se está acabando HOY, y una lista de tiendas que quizá lo tengan es
// peor respuesta que un botón que lo trae a casa. Las opciones de catálogo
// siguen apareciendo debajo, que es lo que cubre a la tienda de barrio.
//
// El casado es el mismo que el de las ofertas por items (minúsculas, sin
// acentos, por subcadena) para que "pienso" case con "Pienso cachorro 3 kg".

export type ShopOption = {
  /** Comprable aquí mismo, o solo informativo. */
  source: 'marketplace' | 'catalog';
  /** Solo en `marketplace`: el producto que se puede comprar. */
  productId?: string;
  /** Ausente cuando el producto lo vendemos nosotros (no hay tienda detrás). */
  partnerId?: string;
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

/** Productos del marketplace que casan y se pueden comprar ya (activos y con stock). */
async function marketplaceOptions(product: string): Promise<ShopOption[]> {
  const products = await Product.find({ active: true, stock: { $gt: 0 } })
    .select('name priceEur sellerId listedBy')
    .limit(200)
    .lean();

  const matching = (products as any[]).filter(p => matchesProduct(p.name || '', product));
  if (!matching.length) return [];

  const sellerIds = matching.map(p => p.sellerId).filter(Boolean);
  const sellers = sellerIds.length
    ? await User.find({ _id: { $in: sellerIds } }).select('name profile.address.city').lean()
    : [];
  const byId = new Map((sellers as any[]).map(s => [String(s._id), s]));

  return matching.map(p => {
    const seller = p.sellerId ? byId.get(String(p.sellerId)) : undefined;
    return {
      source: 'marketplace' as const,
      productId: String(p._id),
      // Lo que listamos nosotros no tiene tienda detrás: el vendedor somos
      // nosotros, y decir otra cosa sería mentir sobre quién factura.
      ...(seller ? { partnerId: String(p.sellerId), city: seller.profile?.address?.city } : {}),
      partnerName: seller ? seller.name : 'MyPetLive',
      item: p.name,
      priceEur: typeof p.priceEur === 'number' ? p.priceEur : undefined,
    };
  });
}

/** Partners que dicen tener `product` en el catálogo de su TPV. Informativo. */
async function catalogOptions(product: string): Promise<ShopOption[]> {
  // El filtro fino se hace en memoria porque el casado es laxo; el grueso
  // —tener catálogo— lo hace Mongo para no traerse todos los usuarios.
  //
  // `vet` estaba fuera de esta lista mientras el editor del perfil SÍ le ofrecía
  // cargar el catálogo: una clínica que lo rellenara no aparecía nunca aquí.
  // `pro` es un rol legado de RentalApp; se mantiene para no quitar de golpe algo
  // que pudiera estar en uso, pero no se le da de alta a nadie nuevo.
  const partners = await User.find({
    role: { $in: ['store', 'vet', 'pro'] },
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
      source: 'catalog',
      partnerId: String(partner._id),
      partnerName: partner.name,
      city: partner.profile?.address?.city,
      item: item.name,
      priceEur: typeof item.priceEur === 'number' ? item.priceEur : undefined,
    });
  }
  return options;
}

/**
 * Dónde conseguir `product`: primero lo que se puede comprar ya, después lo que
 * una tienda dice tener. Dentro de cada grupo, por precio, y los que no publican
 * precio al final (un precio conocido vale más que uno por preguntar).
 */
export async function findWhereToBuy(product: string, limit = 5): Promise<ShopOption[]> {
  const wanted = normalizeItemText(product);
  if (!wanted) return [];

  const [buyable, listed] = await Promise.all([marketplaceOptions(product), catalogOptions(product)]);

  // Una tienda que tiene el producto a la venta de verdad no necesita salir
  // además como "dice tenerlo": sería la misma tienda dos veces.
  const sellingAlready = new Set(buyable.map(option => option.partnerId).filter(Boolean));

  const byPrice = (a: ShopOption, b: ShopOption) => {
    if (a.priceEur === undefined) return 1;
    if (b.priceEur === undefined) return -1;
    return a.priceEur - b.priceEur;
  };

  const options = [
    ...buyable.sort(byPrice),
    ...listed.filter(option => !sellingAlready.has(option.partnerId)).sort(byPrice),
  ];

  const top = options.slice(0, limit);
  if (!top.length) return top;

  // Un cupón del mismo partner que case con el producto hace la diferencia entre
  // "aquí lo tienen" y "aquí te sale más barato". Los productos nuestros no
  // llevan partnerId, así que hay que sacarlos de la consulta: un `undefined`
  // dentro de un `$in` no filtra lo que uno cree.
  const partnerIds = top.map(o => o.partnerId).filter(Boolean);
  const coupons = partnerIds.length
    ? await Coupon.find({ partnerId: { $in: partnerIds }, active: true })
        .select('partnerId title discount targetItems')
        .lean()
    : [];

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
