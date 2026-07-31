import { Router, Request, Response } from 'express';
import { User } from '../models/user.model';
import { Animal } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { Donation } from '../models/donation.model';
import { PatitaTxn } from '../models/patitaTxn.model';
import { canReceiveDonations } from '../utils/shelterVerification';
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
    const [shelterIds, animales, adopciones, donacionRows, patitaRows] = await Promise.all([
      User.find({ role: { $in: ['landlord', 'protectora'] } }).select('_id').lean(),
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

    // Mismo criterio que el directorio público (`listProtectoras`): si un
    // visitante no puede encontrarla, no cuenta. Contar todas las cuentas con
    // rol de protectora decía 4 mientras el directorio solo enseñaba 1.
    const verificadas = await Promise.all(shelterIds.map(s => canReceiveDonations(String(s._id))));
    const protectoras = verificadas.filter(Boolean).length;

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
