import { Router } from 'express';
import { Types } from 'mongoose';
import asyncHandler from '../utils/asyncHandler';
import { Sale } from '../models/sale.model';
import { PartnerIdentification } from '../models/partnerIdentification.model';

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

export default router;
