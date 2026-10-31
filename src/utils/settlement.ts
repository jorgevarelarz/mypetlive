import { Types } from 'mongoose';
import { Sale } from '../models/sale.model';

// Extracto mensual de liquidación de comisiones del partner. No hay modelo propio:
// el extracto se deriva de las ventas (Sale) agrupadas por mes natural, y el estado
// vive en Sale.settlementStatus (pending → invoiced → paid). Los meses se cortan en
// UTC tanto en la agregación como en el rango de marcado, para que "2026-07"
// signifique lo mismo al listar y al liquidar.

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function parsePeriod(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

type StatusCounts = { pending?: number; invoiced?: number; paid?: number };

// pending si queda algo por facturar; invoiced si todo facturado pero falta pago; paid si todo pagado.
export function deriveStatus(counts: StatusCounts): 'pending' | 'invoiced' | 'paid' {
  if (counts.pending) return 'pending';
  if (counts.invoiced) return 'invoiced';
  return 'paid';
}

const groupTotals = {
  sales: { $sum: 1 },
  amountEur: { $sum: '$amountEur' },
  commissionEur: { $sum: '$commissionEur' },
  pending: { $sum: { $cond: [{ $eq: ['$settlementStatus', 'pending'] }, 1, 0] } },
  invoiced: { $sum: { $cond: [{ $eq: ['$settlementStatus', 'invoiced'] }, 1, 0] } },
  paid: { $sum: { $cond: [{ $eq: ['$settlementStatus', 'paid'] }, 1, 0] } },
  invoiceRefs: { $addToSet: '$invoiceRef' },
};

function mapTotals(row: any) {
  return {
    sales: row.sales,
    amountEur: round2(row.amountEur || 0),
    commissionEur: round2(row.commissionEur || 0),
    status: deriveStatus(row),
    breakdown: { pending: row.pending, invoiced: row.invoiced, paid: row.paid },
    invoiceRef: (row.invoiceRefs || []).filter(Boolean)[0] || null,
  };
}

// Extractos del partner: un renglón por mes con ventas, hasta hoy.
export async function partnerStatements(partnerId: Types.ObjectId) {
  const rows = await Sale.aggregate([
    { $match: { partnerId } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, ...groupTotals } },
    { $sort: { _id: -1 } },
  ]);
  return rows.map(row => ({ period: row._id, ...mapTotals(row) }));
}

// Vista admin de un mes: un renglón por partner con ventas en ese periodo.
export async function settlementsForPeriod(start: Date, end: Date) {
  const rows = await Sale.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: '$partnerId', ...groupTotals } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'partner' } },
    { $unwind: { path: '$partner', preserveNullAndEmptyArrays: true } },
    { $addFields: { partnerName: { $ifNull: ['$partner.profile.orgName', '$partner.name'] } } },
    { $sort: { commissionEur: -1 } },
  ]);
  return rows.map(row => ({ partnerId: row._id, partnerName: row.partnerName || null, ...mapTotals(row) }));
}
