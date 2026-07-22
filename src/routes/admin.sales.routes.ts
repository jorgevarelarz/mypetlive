import { Router } from 'express';
import { Types } from 'mongoose';
import asyncHandler from '../utils/asyncHandler';
import { Sale } from '../models/sale.model';
import { PartnerIdentification } from '../models/partnerIdentification.model';
import { parsePeriod, currentPeriod, settlementsForPeriod, round2 } from '../utils/settlement';

// Rutas de admin de ventas de partners (montadas bajo /api/admin con requireAdmin).
const router = Router();

function dateRange(from?: string, to?: string) {
  const range: any = {};
  if (from && !Number.isNaN(new Date(from).getTime())) range.$gte = new Date(from);
  if (to && !Number.isNaN(new Date(to).getTime())) range.$lte = new Date(to);
  return Object.keys(range).length ? range : undefined;
}

// GET /api/admin/sales — listado con filtros + totales agrupados por partner.
router.get(
  '/sales',
  asyncHandler(async (req, res) => {
    const { partnerId, userId, from, to } = req.query as Record<string, string>;
    const filter: any = {};
    if (partnerId && Types.ObjectId.isValid(partnerId)) filter.partnerId = partnerId;
    if (userId && Types.ObjectId.isValid(userId)) filter.userId = userId;
    const range = dateRange(from, to);
    if (range) filter.createdAt = range;

    // El aggregate no castea strings a ObjectId como hace find: match explícito.
    const matchAgg: any = {};
    if (filter.partnerId) matchAgg.partnerId = new Types.ObjectId(String(filter.partnerId));
    if (filter.userId) matchAgg.userId = new Types.ObjectId(String(filter.userId));
    if (filter.createdAt) matchAgg.createdAt = filter.createdAt;

    const [items, byPartner] = await Promise.all([
      Sale.find(filter)
        .sort({ createdAt: -1 })
        .limit(500)
        .populate('partnerId', 'name profile.orgName')
        .populate('userId', 'name')
        .lean(),
      Sale.aggregate([
        { $match: matchAgg },
        {
          $group: {
            _id: '$partnerId',
            sales: { $sum: 1 },
            amountEur: { $sum: '$amountEur' },
            commissionEur: { $sum: '$commissionEur' },
            pendingCommissionEur: {
              $sum: { $cond: [{ $eq: ['$settlementStatus', 'pending'] }, '$commissionEur', 0] },
            },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'partner' } },
        { $unwind: { path: '$partner', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            partnerId: '$_id', _id: 0, sales: 1, amountEur: 1, commissionEur: 1, pendingCommissionEur: 1,
            partnerName: { $ifNull: ['$partner.profile.orgName', '$partner.name'] },
          },
        },
        { $sort: { commissionEur: -1 } },
      ]),
    ]);
    res.json({ items, byPartner });
  }),
);

// GET /api/admin/sales/by-user — qué ventas genera cada usuario (top generadores de comisión).
router.get(
  '/sales/by-user',
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as Record<string, string>;
    const match: any = {};
    const range = dateRange(from, to);
    if (range) match.createdAt = range;
    const byUser = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$userId',
          sales: { $sum: 1 },
          amountEur: { $sum: '$amountEur' },
          commissionEur: { $sum: '$commissionEur' },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { userId: '$_id', _id: 0, sales: 1, amountEur: 1, commissionEur: 1, userName: '$user.name' } },
      { $sort: { commissionEur: -1 } },
      { $limit: 200 },
    ]);
    res.json({ items: byUser });
  }),
);

// GET /api/admin/sales/leaks — fugas de comisión: identificaciones de cliente que no
// acabaron en venta registrada, agrupadas por partner (ratio de declaración).
router.get(
  '/sales/leaks',
  asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const byPartner = await PartnerIdentification.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$partnerId',
          identifications: { $sum: 1 },
          withSale: { $sum: { $cond: [{ $ifNull: ['$saleId', false] }, 1, 0] } },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'partner' } },
      { $unwind: { path: '$partner', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          partnerId: '$_id', _id: 0, identifications: 1, withSale: 1,
          withoutSale: { $subtract: ['$identifications', '$withSale'] },
          declaredRatio: {
            $cond: [{ $gt: ['$identifications', 0] }, { $divide: ['$withSale', '$identifications'] }, null],
          },
          partnerName: { $ifNull: ['$partner.profile.orgName', '$partner.name'] },
        },
      },
      { $sort: { withoutSale: -1 } },
    ]);
    res.json({ days, items: byPartner });
  }),
);

// GET /api/admin/sales/settlements?period=YYYY-MM[&format=csv] — extracto mensual
// de liquidación: un renglón por partner con base, comisión y estado del mes.
router.get(
  '/sales/settlements',
  asyncHandler(async (req, res) => {
    const period = String(req.query.period || currentPeriod());
    const range = parsePeriod(period);
    if (!range) return res.status(400).json({ error: 'invalid_period' });

    const items = await settlementsForPeriod(range.start, range.end);
    const totals = {
      partners: items.length,
      amountEur: round2(items.reduce((a, r) => a + r.amountEur, 0)),
      commissionEur: round2(items.reduce((a, r) => a + r.commissionEur, 0)),
    };

    if (String(req.query.format || '') === 'csv') {
      const header = 'partner;ventas;base_eur;comision_eur;estado;factura';
      const lines = items.map(r =>
        `"${(r.partnerName || String(r.partnerId)).replace(/"/g, '""')}";${r.sales};${r.amountEur};${r.commissionEur};${r.status};${r.invoiceRef || ''}`,
      );
      const csv = [header, ...lines].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="liquidacion-${period}.csv"`);
      // BOM para que Excel abra el UTF-8 con acentos correctos.
      return res.send('\uFEFF' + csv);
    }
    res.json({ period, items, totals });
  }),
);

// POST /api/admin/sales/settlements/:partnerId/:period — avanza la liquidación del
// mes de un partner: action 'invoice' (pending→invoiced, guarda invoiceRef) o
// 'pay' (pending/invoiced→paid). Idempotente: repetir no cambia nada.
router.post(
  '/sales/settlements/:partnerId/:period',
  asyncHandler(async (req, res) => {
    const { partnerId, period } = req.params;
    if (!Types.ObjectId.isValid(partnerId)) return res.status(400).json({ error: 'invalid_partner' });
    const range = parsePeriod(period);
    if (!range) return res.status(400).json({ error: 'invalid_period' });

    const action = String(req.body?.action || '');
    if (!['invoice', 'pay'].includes(action)) return res.status(400).json({ error: 'invalid_action' });
    const invoiceRef = typeof req.body?.invoiceRef === 'string' ? req.body.invoiceRef.trim().slice(0, 120) : undefined;

    const baseFilter = {
      partnerId: new Types.ObjectId(partnerId),
      createdAt: { $gte: range.start, $lt: range.end },
    };
    let result;
    if (action === 'invoice') {
      result = await Sale.updateMany(
        { ...baseFilter, settlementStatus: 'pending' },
        { $set: { settlementStatus: 'invoiced', ...(invoiceRef ? { invoiceRef } : {}) } },
      );
    } else {
      result = await Sale.updateMany(
        { ...baseFilter, settlementStatus: { $in: ['pending', 'invoiced'] } },
        { $set: { settlementStatus: 'paid', ...(invoiceRef ? { invoiceRef } : {}) } },
      );
    }

    // Devuelve el extracto fresco del partner en ese mes para refrescar la UI.
    const items = await settlementsForPeriod(range.start, range.end);
    const statement = items.find(r => String(r.partnerId) === String(partnerId)) || null;
    res.json({ ok: true, updated: result.modifiedCount, statement });
  }),
);

export default router;
