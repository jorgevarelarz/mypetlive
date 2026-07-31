import { Router, Request, Response } from 'express';
import { User } from '../models/user.model';
import { Animal } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { Donation } from '../models/donation.model';
import { PatitaTxn } from '../models/patitaTxn.model';
import asyncHandler from '../utils/asyncHandler';

const router = Router();

/**
 * Cifras REALES para la portada. Existía una sección de impacto con números
 * inventados en el código (85 protectoras, 1.247 adopciones, 38.200 € donados,
 * 126k Patitas) mientras la base de datos estaba casi a cero: además de quedar
 * en evidencia contra la propia web, anunciar cifras que no existen es
 * publicidad engañosa. La portada pinta solo lo que aquí venga por encima de
 * cero, así que este endpoint no necesita maquillar nada.
 */
router.get(
  '/stats/public',
  asyncHandler(async (_req: Request, res: Response) => {
    const [protectoras, animales, adopciones, donacionRows, patitaRows] = await Promise.all([
      User.countDocuments({ role: { $in: ['landlord', 'protectora'] } }),
      Animal.countDocuments({ isPersonalPet: { $ne: true }, status: 'publicado' }),
      Adoption.countDocuments({ status: 'aprobada' }),
      Donation.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, cents: { $sum: '$amount' } } },
      ]),
      PatitaTxn.aggregate([
        { $match: { type: 'earn' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      protectoras,
      animales,
      adopciones,
      donadoEur: Math.round((donacionRows[0]?.cents || 0) / 100),
      patitas: patitaRows[0]?.total || 0,
    });
  }),
);

export default router;
