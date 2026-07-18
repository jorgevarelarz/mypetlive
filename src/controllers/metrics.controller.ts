import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Animal } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { Donation } from '../models/donation.model';
import { PatitaTxn } from '../models/patitaTxn.model';
import { Coupon } from '../models/coupon.model';
import { Sale } from '../models/sale.model';
import { PartnerIdentification } from '../models/partnerIdentification.model';

function monthStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function sumPatitas(filter: Record<string, unknown>) {
  const [row] = await PatitaTxn.aggregate([
    { $match: filter },
    { $group: { _id: null, amount: { $sum: '$amount' }, valueEur: { $sum: { $ifNull: ['$valueEur', 0] } } } },
  ]);
  return { amount: row?.amount || 0, valueEur: round2(row?.valueEur || 0) };
}

// GET /api/protectoras/me/metrics[?format=csv] — finanzas e impacto de la protectora.
export async function shelterMetrics(req: Request, res: Response) {
  const user: any = (req as any).user;
  const shelterId = new Types.ObjectId(String(user._id || user.id));
  const since = monthStart();

  // Las adopciones referencian al animal por id (string); partimos de los animales de la protectora.
  const animalIds = await Animal.find({ shelter: shelterId, isPersonalPet: { $ne: true } }).distinct('_id');
  const animalIdStrings = animalIds.map(id => String(id));

  const [byStatus, adoptedMonth, avgRow] = await Promise.all([
    Adoption.aggregate([
      { $match: { animalId: { $in: animalIdStrings } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Adoption.countDocuments({ animalId: { $in: animalIdStrings }, status: 'aprobada', updatedAt: { $gte: since } }),
    // 'aprobada' es terminal: updatedAt ≈ momento de la aprobación.
    Adoption.aggregate([
      { $match: { animalId: { $in: animalIdStrings }, status: 'aprobada' } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ['$updatedAt', '$createdAt'] } } } },
    ]),
  ]);
  const counts: Record<string, number> = {};
  for (const row of byStatus) counts[row._id] = row.count;
  const approved = counts['aprobada'] || 0;
  const closed = approved + (counts['rechazada'] || 0) + (counts['cancelada'] || 0);
  const totalRequests = Object.values(counts).reduce((a, b) => a + b, 0);

  const donationMatch = { animalId: { $in: animalIdStrings }, status: 'completed' };
  const [donAll, donMonth] = await Promise.all([
    Donation.aggregate([{ $match: donationMatch }, { $group: { _id: null, cents: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Donation.aggregate([
      { $match: { ...donationMatch, createdAt: { $gte: since } } },
      { $group: { _id: null, cents: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  const [patitasReceived, patitasRedeemed] = await Promise.all([
    sumPatitas({ shelterId, type: 'donate' }),
    sumPatitas({ shelterId, type: 'redeem' }),
  ]);

  const metrics = {
    adopciones: {
      total: approved,
      esteMes: adoptedMonth,
      solicitudesTotales: totalRequests,
      conversionPct: closed ? round2((approved / closed) * 100) : null,
      diasMediosProceso: avgRow[0]?.avgMs != null ? round2(avgRow[0].avgMs / 86400000) : null,
    },
    donaciones: {
      totalEur: round2((donAll[0]?.cents || 0) / 100),
      numero: donAll[0]?.count || 0,
      esteMesEur: round2((donMonth[0]?.cents || 0) / 100),
      esteMesNumero: donMonth[0]?.count || 0,
    },
    patitas: {
      recibidas: patitasReceived.amount,
      canjeadas: patitasRedeemed.amount,
      canjeadasEur: patitasRedeemed.valueEur,
    },
  };

  if (String(req.query.format || '') === 'csv') {
    const rows: Array<[string, string | number]> = [
      ['Adopciones totales', metrics.adopciones.total],
      ['Adopciones este mes', metrics.adopciones.esteMes],
      ['Solicitudes totales', metrics.adopciones.solicitudesTotales],
      ['Conversión solicitud→adopción (%)', metrics.adopciones.conversionPct ?? ''],
      ['Días medios de proceso', metrics.adopciones.diasMediosProceso ?? ''],
      ['Donaciones (€)', metrics.donaciones.totalEur],
      ['Donaciones (nº)', metrics.donaciones.numero],
      ['Donaciones este mes (€)', metrics.donaciones.esteMesEur],
      ['Patitas recibidas', metrics.patitas.recibidas],
      ['Patitas canjeadas', metrics.patitas.canjeadas],
      ['Patitas canjeadas (€)', metrics.patitas.canjeadasEur],
    ];
    const csv = 'metrica;valor\n' + rows.map(([k, v]) => `"${k}";${v}`).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="metricas-protectora.csv"');
    // BOM para que Excel abra el UTF-8 con acentos correctos.
    return res.send('\uFEFF' + csv);
  }
  res.json(metrics);
}

// GET /api/partners/me/metrics — retorno visible del partner (tienda/vet).
export async function partnerMetrics(req: Request, res: Response) {
  const user: any = (req as any).user;
  const partnerId = new Types.ObjectId(String(user._id || user.id));
  const since = monthStart();

  const [couponsTotal, couponsUsed, couponsUsedMonth] = await Promise.all([
    Coupon.countDocuments({ partnerId }),
    Coupon.countDocuments({ partnerId, usedAt: { $exists: true } }),
    Coupon.countDocuments({ partnerId, usedAt: { $gte: since } }),
  ]);

  // Clientes únicos vistos por el partner: identificados, compradores o usuarios de cupón.
  const [identified, buyers, couponUsers] = await Promise.all([
    PartnerIdentification.distinct('userId', { partnerId }),
    Sale.distinct('userId', { partnerId }),
    Coupon.distinct('usedBy', { partnerId, usedBy: { $exists: true, $ne: null } }),
  ]);
  const customers = new Set([...identified, ...buyers, ...couponUsers].map(id => String(id)));

  const salesAgg = (match: Record<string, unknown>) =>
    Sale.aggregate([
      { $match: match },
      { $group: { _id: null, count: { $sum: 1 }, amountEur: { $sum: '$amountEur' }, commissionEur: { $sum: '$commissionEur' } } },
    ]);
  const [salesAll, salesMonth, patitasReceived] = await Promise.all([
    salesAgg({ partnerId }),
    salesAgg({ partnerId, createdAt: { $gte: since } }),
    sumPatitas({ partnerId, type: 'redeem' }),
  ]);

  res.json({
    cupones: { total: couponsTotal, usados: couponsUsed, usadosEsteMes: couponsUsedMonth },
    clientes: { unicos: customers.size },
    patitas: { recibidas: patitasReceived.amount, valorEur: patitasReceived.valueEur },
    ventas: {
      numero: salesAll[0]?.count || 0,
      totalEur: round2(salesAll[0]?.amountEur || 0),
      comisionEur: round2(salesAll[0]?.commissionEur || 0),
      esteMesNumero: salesMonth[0]?.count || 0,
      esteMesEur: round2(salesMonth[0]?.amountEur || 0),
    },
  });
}
