import { Types } from 'mongoose';
import { Sale } from '../models/sale.model';
import { Coupon } from '../models/coupon.model';
import { PartnerIdentification } from '../models/partnerIdentification.model';
import { earnForUser, EarnResult, COUPON_PATITAS_REWARD_DEFAULT, PATITA_VALUE_EUR } from './patitas';
import { eligibleCoupons, serializeCoupon } from './coupons';
import { withTxnIfAvailable } from './txn';
import { patitasCuponDisponibles, costePatitasEur, PATITA_MARGIN_PCT } from './couponRules';
export { costePatitasEur, PATITA_MARGIN_PCT };

// Comisión de plataforma por defecto (%) sobre ventas de partners y Patitas por € de compra.
export const DEFAULT_SALE_COMMISSION_PCT = Number(process.env.PLATFORM_SALE_COMMISSION_PCT || 5);

// Modelo de Patitas (decisión de Jorge, 2 nov 2026). Antes se daba 1 Patita
// (0,10 €) por € de compra contra un 5 % de comisión: la plataforma pagaba el
// doble de lo que cobraba, y los cupones y visitas, gratis para el comercio.
//  - La comisión es fija (el % de la venta) y no sube por las Patitas de la compra.
//  - De esa comisión, esta parte (50 %) vuelve al cliente en Patitas, a su valor.
//    Compra de 20 € al 5 %: comisión 1 €, 0,50 € = 5 Patitas, nos quedan 0,50 €.
//  - Las Patitas extra (cupones y visitas) las paga el comercio que las da, a su
//    valor más el margen de la plataforma (20 %): 0,12 € cada una.
export const PATITAS_COMMISSION_SHARE_PCT = (() => {
  const n = Number(process.env.PATITAS_COMMISSION_SHARE_PCT);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 50;
})();
/** Cargo al comercio por Patitas dadas sin compra (cupón suelto o visita). */
export async function cargarPatitas(
  input: { partnerId: string; partnerType: 'store' | 'vet'; userId: string; patitas: number; kind: 'coupon' | 'visit'; appliedCoupon?: any },
  session?: any,
) {
  const coste = costePatitasEur(input.patitas);
  await Sale.create([{
    partnerId: input.partnerId, partnerType: input.partnerType, userId: input.userId, kind: input.kind,
    amountEur: 0, items: [], commissionPct: 0, commissionEur: coste, patitasCostEur: coste,
    patitasEarned: input.kind === 'visit' ? input.patitas : 0,
    couponPatitas: input.kind === 'coupon' ? input.patitas : 0,
    ...(input.appliedCoupon ? { appliedCoupons: [input.appliedCoupon] } : {}),
  }], session ? { session } : {});
  return coste;
}

export type SaleItem = { name: string; qty: number; priceEur?: number };

// Sanea las líneas del ticket que llegan del partner (panel o TPV).
export function sanitizeSaleItems(raw: any): SaleItem[] {
  const items = Array.isArray(raw) ? raw.slice(0, 50) : [];
  return items
    .map((i: any) => ({
      name: String(i?.name || '').trim().slice(0, 120),
      qty: Number.isFinite(Number(i?.qty)) && Number(i.qty) > 0 ? Number(i.qty) : 1,
      priceEur: Number.isFinite(Number(i?.priceEur)) && Number(i.priceEur) >= 0 ? Number(i.priceEur) : undefined,
    }))
    .filter((i: SaleItem) => i.name);
}

export type RecordSaleResult = {
  saleId: string;
  commissionPct: number;
  commissionEur: number;
  patitasEarned: number;
  earn: EarnResult | null;
};

// Cálculo puro de comisión y Patitas de una venta: lo comparten recordSale y el
// modo sandbox del TPV (que simula la venta sin persistir nada).
export function computeSaleFigures(partner: any, amountEur: number) {
  const commissionPct = partner?.profile?.commissionPct ?? DEFAULT_SALE_COMMISSION_PCT;
  const commissionEur = Math.round(amountEur * commissionPct) / 100; // redondeo a céntimos
  // Las Patitas de la compra salen de nuestra comisión (no se le cobran aparte).
  const patitas = Math.floor((commissionEur * PATITAS_COMMISSION_SHARE_PCT) / 100 / PATITA_VALUE_EUR + 1e-9);
  return { commissionPct, commissionEur, patitas, patitasCostEur: 0 };
}

// Registra la venta de un partner: crea el Sale (snapshot de comisión), enlaza la
// identificación previa pendiente y acredita Patitas proporcionales al importe.
// Todo dentro de una transacción cuando el despliegue lo permite: no queda venta
// sin Patitas ni Patitas sin venta. `partner` debe traer al menos _id, role, name
// y profile.{orgName,commissionPct}. `externalRef` (id del ticket en el TPV) hace
// la venta idempotente: el índice único (partnerId, externalRef) rechaza duplicados.
export async function recordSale(
  partner: any,
  userId: string,
  amountEur: number,
  rawItems: any,
  opts: { externalRef?: string } = {},
): Promise<RecordSaleResult> {
  const items = sanitizeSaleItems(rawItems);
  const partnerType = partner?.role === 'vet' ? 'vet' : 'store';
  const { commissionPct, commissionEur, patitas, patitasCostEur } = computeSaleFigures(partner, amountEur);

  return withTxnIfAvailable(async (session) => {
    const [sale] = await Sale.create([{
      partnerId: partner._id, partnerType, userId, amountEur, items,
      commissionPct, commissionEur, patitasEarned: patitas, patitasCostEur,
      ...(opts.externalRef ? { externalRef: opts.externalRef } : {}),
    }], { session });

    // Enlazar la identificación previa más reciente aún sin venta (informe de fugas).
    await PartnerIdentification.findOneAndUpdate(
      { partnerId: partner._id, userId, saleId: null },
      { saleId: sale._id },
      { sort: { createdAt: -1 } },
    ).session(session ?? null);

    const partnerName = partner?.profile?.orgName || partner?.name || 'partner';
    const earn = patitas > 0
      ? await earnForUser({
          userId, amount: patitas, source: 'purchase', partnerId: String(partner._id),
          concept: `Compra de ${amountEur.toFixed(2)} € en ${partnerName}`,
        }, session)
      : null;

    return { saleId: String(sale._id), commissionPct, commissionEur, patitasEarned: patitas, earn };
  });
}

// Qué cupones consumir en una venta: los explícitos en couponIds, todos los
// elegibles si applyCoupons:true, o ninguno por defecto. Lo comparten el TPV
// (posSale) y la Caja propia (registerSale) — mismo criterio en ambos canales.
export async function couponsToApplyForSale(partnerId: string, userId: string, body: any) {
  const explicit = Array.isArray(body?.couponIds)
    ? body.couponIds.map(String).filter((id: string) => Types.ObjectId.isValid(id))
    : null;
  if (explicit?.length) {
    return (await eligibleCoupons(partnerId, userId)).filter((c: any) => explicit.includes(String(c._id)));
  }
  if (body?.applyCoupons === true) return eligibleCoupons(partnerId, userId);
  return [];
}

export type AppliedSaleCoupon = ReturnType<typeof serializeCoupon> & { bonusPatitas: number };

// Consume los cupones elegidos como parte de una venta ya creada: marcado atómico
// de uso (findOneAndUpdate con filtro usedAt evita el doble consumo con cajas
// concurrentes) + Patitas de bonus al cliente, y persiste el detalle en la venta
// para auditoría y para que un reintento idempotente devuelva la misma respuesta.
class SinCupo extends Error {}
export type SkippedSaleCoupon = { couponId: string; title?: string; reason: 'coupon_patitas_limit' };

export async function applyCouponsToSale(
  saleId: string,
  partnerId: string,
  userId: string,
  coupons: any[],
): Promise<{ appliedCoupons: AppliedSaleCoupon[]; couponPatitas: number; skippedCoupons: SkippedSaleCoupon[] }> {
  const appliedCoupons: AppliedSaleCoupon[] = [];
  // Los que no caben en el tope del cliente: no se consumen y se dice (AUD-5).
  const skippedCoupons: SkippedSaleCoupon[] = [];
  let couponPatitas = 0;
  for (const c of coupons) {
    let usadoSinSesion: any = null;
    let applied: any;
    try {
    applied = await withTxnIfAvailable(async (session) => {
      // Activo y sin usar, como en useCoupon (AUD-4): uno desactivado entre la
      // lectura y aquí ya no se consume.
      const used: any = await Coupon.findOneAndUpdate(
        { _id: c._id, active: true, usedAt: null },
        { usedAt: new Date(), usedBy: partnerId },
        { new: true, session },
      );
      if (!used) return null;
      if (!session) usadoSinSesion = used;
      const reward = Number(used.bonusPatitas) > 0 ? Math.round(Number(used.bonusPatitas)) : COUPON_PATITAS_REWARD_DEFAULT;
      // Mismo tope por cliente y comercio que useCoupon (AUD-4, FAC-138): el
      // cupón que no cabe no se consume y sigue disponible.
      if (reward > await patitasCuponDisponibles(userId, partnerId, session)) throw new SinCupo();
      await earnForUser({
        userId, amount: reward, source: 'coupon', partnerId, couponId: String(used._id),
        concept: `Cupón: ${used.title || used.copy}`,
      }, session);
      // Las Patitas del cupón, a la comisión de esta venta.
      const coste = costePatitasEur(reward);
      await Sale.updateOne({ _id: saleId }, { $inc: { commissionEur: coste, patitasCostEur: coste } }, session ? { session } : {});
      return { used, reward };
    });
    } catch (err) {
      if (!(err instanceof SinCupo)) throw err;
      // Sin transacción (desarrollo y tests) se devuelve el cupón a mano.
      if (usadoSinSesion) await Coupon.updateOne({ _id: usadoSinSesion._id }, { $set: { usedAt: null, usedBy: null } });
      skippedCoupons.push({ couponId: String(c._id), title: c.title || c.copy, reason: 'coupon_patitas_limit' });
      continue;
    }
    if (!applied) continue;
    couponPatitas += applied.reward;
    appliedCoupons.push({ ...serializeCoupon(applied.used), bonusPatitas: applied.reward });
  }

  if (appliedCoupons.length) {
    await Sale.updateOne(
      { _id: saleId },
      {
        couponPatitas,
        appliedCoupons: appliedCoupons.map(c => ({
          couponId: c._id,
          title: c.title,
          discount: c.discount,
          bonusPatitas: c.bonusPatitas,
          targetAnimalCode: c.targetAnimalCode,
        })),
      },
    );
  }

  return { appliedCoupons, couponPatitas, skippedCoupons };
}

// Ventana en la que reescanear al mismo cliente no crea otra identificación: sin
// esto, cada escaneo repetido del TPV/panel contaría como "venta no declarada"
// en el informe de fugas e inflaría injustamente el ratio del partner.
export const IDENTIFICATION_DEDUPE_MS = 15 * 60 * 1000;

// Persiste la identificación de un cliente por un partner, deduplicando dentro
// de la ventana: si ya hay una reciente sin venta enlazada, se reutiliza.
export async function recordIdentification(partnerId: string, userId: string) {
  const since = new Date(Date.now() - IDENTIFICATION_DEDUPE_MS);
  const recent = await PartnerIdentification.findOne({
    partnerId, userId, saleId: null, createdAt: { $gte: since },
  }).select('_id');
  if (recent) return recent;
  return PartnerIdentification.create({ partnerId, userId });
}
