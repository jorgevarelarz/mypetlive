import { Types } from 'mongoose';
import { Sale } from '../models/sale.model';

// Segmentación de ofertas por items comprados (F5, comisiones fase 2): los cupones
// pueden llevar `targetItems` (palabras clave) que se casan contra las líneas del
// ticket (Sale.items.name) del historial de compra del usuario. El matching es
// laxo a propósito: minúsculas, sin acentos y por subcadena ("pienso" casa con
// "Pienso cachorro 3kg").

const DEFAULT_WINDOW_DAYS = 180;

export function normalizeItemText(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Sin targeting de items no restringe; con targeting exige al menos una coincidencia.
export function itemsMatch(targetItems?: string[], purchasedNames?: string[]): boolean {
  if (!targetItems?.length) return true;
  if (!purchasedNames?.length) return false;
  const haystack = purchasedNames.map(normalizeItemText);
  return targetItems.some(t => {
    const key = normalizeItemText(t);
    return !!key && haystack.some(name => name.includes(key));
  });
}

// Devuelve los items que provocan el match (para explicar la oferta en la UI).
export function matchedItems(targetItems?: string[], purchasedNames?: string[]): string[] {
  if (!targetItems?.length || !purchasedNames?.length) return [];
  const keys = targetItems.map(normalizeItemText).filter(Boolean);
  return Array.from(new Set(purchasedNames.filter(name => {
    const n = normalizeItemText(name);
    return keys.some(k => n.includes(k));
  })));
}

// Nombres de items comprados por el usuario (opcionalmente solo en un partner)
// dentro de la ventana reciente.
export async function purchasedItemNames(
  userId: string | Types.ObjectId,
  opts: { partnerId?: string | Types.ObjectId; days?: number } = {},
): Promise<string[]> {
  const since = new Date(Date.now() - (opts.days ?? DEFAULT_WINDOW_DAYS) * 86400000);
  const filter: any = { userId, createdAt: { $gte: since } };
  if (opts.partnerId) filter.partnerId = opts.partnerId;
  const sales = await Sale.find(filter).select('items.name').lean();
  return sales.flatMap((s: any) => (s.items || []).map((i: any) => i.name)).filter(Boolean);
}
