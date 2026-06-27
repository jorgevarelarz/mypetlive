import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/jwt';
import { User } from '../models/user.model';
import { PatitaTxn } from '../models/patitaTxn.model';

// 1 Patita = 0,10 € por defecto (configurable). Las Patitas son moneda de impacto:
// el usuario las genera, las dona a una protectora, y la protectora las canjea en un
// partner; al canjear, la plataforma paga el € equivalente al partner (modelo RSC).
export const PATITA_VALUE_EUR = (() => {
  const n = Number(process.env.PATITA_VALUE_EUR);
  return Number.isFinite(n) && n > 0 ? n : 0.1;
})();

// Patitas fijas que genera una visita identificada a tienda.
export const VISIT_PATITAS_REWARD = (() => {
  const n = Number(process.env.VISIT_PATITAS_REWARD);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 5;
})();

// Recompensa por cupón si el cupón no define su propio bonusPatitas.
export const COUPON_PATITAS_REWARD_DEFAULT = (() => {
  const n = Number(process.env.COUPON_PATITAS_REWARD_DEFAULT);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 20;
})();

export function eurFromPatitas(amount: number): number {
  return Math.round(amount * PATITA_VALUE_EUR * 100) / 100;
}

export function centsFromPatitas(amount: number): number {
  return Math.round(amount * PATITA_VALUE_EUR * 100);
}

// Código de confirmación de canje legible (ej. "MPL-7G2K-4QX9").
export function genRedeemCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0/I/1 para evitar confusión
  const block = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `MPL-${block()}-${block()}`;
}

const WALLET_TOKEN_TTL = '10m';

// Token corto firmado que codifica la wallet de la protectora para el QR de canje.
export function signWalletToken(shelterId: string): string {
  return jwt.sign({ shelterId, purpose: 'patitas-wallet' }, getJwtSecret(), { expiresIn: WALLET_TOKEN_TTL });
}

export function verifyWalletToken(token: string): { shelterId: string } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    if (decoded?.purpose !== 'patitas-wallet' || !decoded?.shelterId) return null;
    return { shelterId: String(decoded.shelterId) };
  } catch {
    return null;
  }
}

// Token de identidad del usuario: lo muestra el cliente (QR) para que el partner le
// genere Patitas al usar un cupón o registrar una visita.
export function signUserToken(userId: string): string {
  return jwt.sign({ userId, purpose: 'patitas-user' }, getJwtSecret(), { expiresIn: WALLET_TOKEN_TTL });
}

export function verifyUserToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    if (decoded?.purpose !== 'patitas-user' || !decoded?.userId) return null;
    return { userId: String(decoded.userId) };
  } catch {
    return null;
  }
}

// Acredita Patitas a un usuario/protectora. Devuelve el nuevo saldo.
export async function creditPatitas(userId: string, amount: number): Promise<number> {
  const updated = await User.findByIdAndUpdate(userId, { $inc: { patitas: amount } }, { new: true }).select('patitas');
  return updated?.patitas ?? 0;
}

// Transferencia atómica de Patitas: descuenta del origen solo si tiene saldo suficiente,
// luego acredita al destino. Devuelve los saldos resultantes o null si saldo insuficiente.
export async function transferPatitas(
  fromId: string,
  toId: string,
  amount: number,
): Promise<{ fromBalance: number; toBalance: number } | null> {
  const debited = await User.findOneAndUpdate(
    { _id: fromId, patitas: { $gte: amount } },
    { $inc: { patitas: -amount } },
    { new: true },
  ).select('patitas');
  if (!debited) return null;
  const credited = await User.findByIdAndUpdate(toId, { $inc: { patitas: amount } }, { new: true }).select('patitas');
  if (!credited) {
    // Revertir si el destino no existe (caso muy raro).
    await User.findByIdAndUpdate(fromId, { $inc: { patitas: amount } });
    return null;
  }
  return { fromBalance: debited.patitas ?? 0, toBalance: credited.patitas ?? 0 };
}

export type EarnInput = {
  userId: string;
  amount: number;
  source: 'coupon' | 'visit' | 'manual';
  partnerId?: string;
  couponId?: string;
  animalId?: string;
  concept?: string;
};

export type EarnResult = {
  earned: number;
  balance: number;
  autoDonated: boolean;
  shelterId?: string;
};

/**
 * Acredita Patitas generadas a un usuario y registra la txn `earn`. Si el usuario tiene
 * auto-donación activa, reenvía inmediatamente esas Patitas a su protectora elegida
 * (txn `donate`). Helper compartido por la generación vía cupón y vía visita a tienda.
 */
export async function earnForUser(input: EarnInput): Promise<EarnResult> {
  const { userId, amount, source, partnerId, couponId, animalId, concept } = input;
  const balance = await creditPatitas(userId, amount);
  await PatitaTxn.create({ type: 'earn', userId, amount, source, partnerId, couponId, animalId, concept });

  const user = await User.findById(userId).select('profile.autoDonate').lean();
  const auto = (user as any)?.profile?.autoDonate;
  if (auto?.enabled && auto?.shelterId) {
    const shelterId = String(auto.shelterId);
    const moved = await transferPatitas(userId, shelterId, amount);
    if (moved) {
      await PatitaTxn.create({ type: 'donate', userId, shelterId, amount, concept: 'Auto-donación' });
      return { earned: amount, balance: moved.fromBalance, autoDonated: true, shelterId };
    }
  }
  return { earned: amount, balance, autoDonated: false };
}
