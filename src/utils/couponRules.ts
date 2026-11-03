// Reglas comunes a todo lo que da Patitas con un cupón: el uso suelto
// (useCoupon), la venta de caja (registerSale) y el TPV (posSale). AUD-4
// (FAC-138 y FAC-139): antes cada camino tenía las suyas y la venta no miraba
// a quién iban las Patitas.
import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { User } from '../models/user.model';
import { PatitaTxn } from '../models/patitaTxn.model';
import { COUPON_PATITAS_DAY_PER_CLIENT, COUPON_PATITAS_MONTH_PER_CLIENT } from './limits';

const DIA_MS = 86_400_000;

/** Las Patitas de cupón solo van a una familia (tenant), y nunca al propio comercio. */
export async function beneficiarioValido(partnerId: string, userId: string): Promise<boolean> {
  if (!userId || String(userId) === String(partnerId)) return false;
  const u: any = await User.findById(userId).select('role').lean();
  return !!u && u.role === 'tenant';
}

async function sumaCupones(userId: string, partnerId: string, desde: Date, session?: ClientSession) {
  const r = await PatitaTxn.aggregate([
    { $match: { type: 'earn', source: 'coupon', userId: new Types.ObjectId(userId), partnerId: new Types.ObjectId(partnerId), createdAt: { $gte: desde } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).session(session ?? null);
  return Number(r[0]?.total) || 0;
}

/**
 * Patitas de cupón que este comercio aún puede dar a este cliente: lo que quede
 * del tope de 24 h y del de 30 días (los dos móviles, contados en el servidor).
 */
export async function patitasCuponDisponibles(userId: string, partnerId: string, session?: ClientSession) {
  const ahora = Date.now();
  // Una tras otra: dentro de una transacción no se lanzan dos a la vez por la misma sesión.
  const dia = await sumaCupones(userId, partnerId, new Date(ahora - DIA_MS), session);
  const mes = await sumaCupones(userId, partnerId, new Date(ahora - 30 * DIA_MS), session);
  return Math.max(0, Math.min(COUPON_PATITAS_DAY_PER_CLIENT - dia, COUPON_PATITAS_MONTH_PER_CLIENT - mes));
}
