import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { User } from '../models/user.model';
import { Animal } from '../models/animal.model';
import { canReceiveDonations } from '../utils/shelterVerification';

// Perfil público de una protectora: cabecera de presentación (nombre, bio,
// ubicación, verificación) + contadores. Los animales los pide el frontend
// al catálogo público con ?shelter=<id> (mismo endpoint que el listado).
export async function getShelterPublicProfile(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(404).json({ error: 'not_found' });
  const user: any = await User.findById(id)
    .select('name role createdAt profile.orgName profile.bio profile.avatarUrl profile.website profile.address')
    .lean();
  // En BD las protectoras usan el rol 'landlord' (legado normalizado).
  if (!user || user.role !== 'landlord') return res.status(404).json({ error: 'not_found' });

  const [published, adopted, verified] = await Promise.all([
    Animal.countDocuments({ shelter: id, status: 'publicado', isPersonalPet: { $ne: true } }),
    Animal.countDocuments({ shelter: id, status: 'adoptado', isPersonalPet: { $ne: true } }),
    canReceiveDonations(id),
  ]);

  const p = user.profile || {};
  res.json({
    id: String(user._id),
    name: p.orgName || user.name,
    bio: p.bio || null,
    avatarUrl: p.avatarUrl || null,
    website: p.website || null,
    city: p.address?.city || null,
    memberSince: user.createdAt,
    verified,
    stats: { published, adopted },
  });
}
