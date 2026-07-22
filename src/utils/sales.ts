import { Types } from 'mongoose';
import { Sale } from '../models/sale.model';
import { Coupon } from '../models/coupon.model';
import { PartnerIdentification } from '../models/partnerIdentification.model';
import { earnForUser, EarnResult, COUPON_PATITAS_REWARD_DEFAULT } from './patitas';
import { eligibleCoupons, serializeCoupon } from './coupons';
import { withTxnIfAvailable } from './txn';

// Comisión de plataforma por defecto (%) sobre ventas de partners y Patitas por € de compra.
export const DEFAULT_SALE_COMMISSION_PCT = Number(process.env.PLATFORM_SALE_COMMISSION_PCT || 5);
export const PATITAS_PER_EUR = Number(process.env.PATITAS_PER_EUR || 1);

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
  const patitas = Math.floor(amountEur * PATITAS_PER_EUR);
  return { commissionPct, commissionEur, patitas };
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
  const { commissionPct, commissionEur, patitas } = computeSaleFigures(partner, amountEur);

  return withTxnIfAvailable(async (session) => {
    const [sale] = await Sale.create([{
      partnerId: partner._id, partnerType, userId, amountEur, items,
      commissionPct, commissionEur, patitasEarned: patitas,
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
export async function applyCouponsToSale(
  saleId: string,
  partnerId: string,
  userId: string,
  coupons: any[],
): Promise<{ appliedCoupons: AppliedSaleCoupon[]; couponPatitas: number }> {
  const appliedCoupons: AppliedSaleCoupon[] = [];
  let couponPatitas = 0;
  for (const c of coupons) {
    const applied = await withTxnIfAvailable(async (session) => {
      const used: any = await Coupon.findOneAndUpdate(
        { _id: c._id, usedAt: { $exists: false } },
        { usedAt: new Date(), usedBy: partnerId },
        { new: true, session },
      );
      if (!used) return null;
      const reward = Number(used.bonusPatitas) > 0 ? Math.round(Number(used.bonusPatitas)) : COUPON_PATITAS_REWARD_DEFAULT;
      await earnForUser({
        userId, amount: reward, source: 'coupon', partnerId, couponId: String(used._id),
        concept: `Cupón: ${used.title || used.copy}`,
      }, session);
      return { used, reward };
    });
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

  return { appliedCoupons, couponPatitas };
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
