// Reglas comunes a todo lo que da Patitas con un cupón: el uso suelto
// (useCoupon), la venta de caja (registerSale) y el TPV (posSale). AUD-4
// (FAC-138 y FAC-139): antes cada camino tenía las suyas y la venta no miraba
// a quién iban las Patitas.
import type { ClientSession } from 'mongoose';
import { Types, Schema, model, models } from 'mongoose';
import { User } from '../models/user.model';
import { PatitaTxn } from '../models/patitaTxn.model';
import { COUPON_PATITAS_DAY_PER_CLIENT, COUPON_PATITAS_MONTH_PER_CLIENT } from './limits';
import { PATITA_VALUE_EUR, COUPON_PATITAS_REWARD_DEFAULT, VISIT_PATITAS_REWARD } from './patitas';

const DIA_MS = 86_400_000;

// Cerrojo para los topes (AUD-5, FAC-156 y FAC-157): contar y luego escribir no
// es atómico, y dos peticiones a la vez leían el mismo hueco. Cada una escribe
// primero en este documento dentro de su transacción; si coinciden, Mongo da
// conflicto de escritura, la transacción se repite y vuelve a contar ya con lo
// de la otra. Sin transacción (desarrollo y tests) no se serializa.
const cerrojoSchema = new Schema({ _id: { type: String, required: true }, n: { type: Number, default: 0 } }, { versionKey: false });
const Cerrojo = (models.CuponCerrojo as any) || model('CuponCerrojo', cerrojoSchema);
export async function cerrar(clave: string, session?: ClientSession) {
  if (!session) return;
  await Cerrojo.updateOne({ _id: clave }, { $inc: { n: 1 } }, { upsert: true, session });
}

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
  await cerrar(`cupo|${userId}|${partnerId}`, session);
  const ahora = Date.now();
  // Una tras otra: dentro de una transacción no se lanzan dos a la vez por la misma sesión.
  const dia = await sumaCupones(userId, partnerId, new Date(ahora - DIA_MS), session);
  const mes = await sumaCupones(userId, partnerId, new Date(ahora - 30 * DIA_MS), session);
  return Math.max(0, Math.min(COUPON_PATITAS_DAY_PER_CLIENT - dia, COUPON_PATITAS_MONTH_PER_CLIENT - mes));
}

// Lo que paga el comercio por cada Patita extra que da (cupones y visitas): su
// valor más el margen de la plataforma (decisión de Jorge, 2 nov 2026).
export const PATITA_MARGIN_PCT = (() => {
  const n = Number(process.env.PATITA_MARGIN_PCT);
  return Number.isFinite(n) && n >= 0 ? n : 20;
})();
export function costePatitasEur(patitas: number) {
  return Math.round(Math.max(0, patitas) * PATITA_VALUE_EUR * (1 + PATITA_MARGIN_PCT / 100) * 100) / 100;
}

/** Patitas que da de verdad un cupón: las suyas o las de por defecto. */
export function recompensaCupon(bonusPatitas: any) {
  return Number(bonusPatitas) > 0 ? Math.round(Number(bonusPatitas)) : COUPON_PATITAS_REWARD_DEFAULT;
}

/** Lo que la caja enseña antes de dar Patitas extra (AUD-5, FAC-150). */
export function tarifaPatitas() {
  return {
    costePorPatitaEur: costePatitasEur(1),
    visita: { patitas: VISIT_PATITAS_REWARD, costEur: costePatitasEur(VISIT_PATITAS_REWARD) },
    cuponPorDefecto: COUPON_PATITAS_REWARD_DEFAULT,
  };
}
