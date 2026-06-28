import { Request, Response } from 'express';
import { User } from '../models/user.model';
import getRequestLogger from '../utils/requestLogger';

/**
 * Retrieve a list of all users. The password hash is excluded for security.
 */
export const getAllUsers = async (req: Request, res: Response) => {
  const { q = '', role = '', page = '1', limit = '10' } = (req.query || {}) as any;
  const pg = Math.max(1, parseInt(String(page)) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(String(limit)) || 10));

  const query: any = {};
  if (role) query.role = role;
  if (q) {
    const term = String(q).trim();
    if (term) query.$or = [
      { email: { $regex: term, $options: 'i' } },
      { role: { $regex: term, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(query)
      .select('-passwordHash')
      .sort({ ratingAvg: -1, reviewCount: -1, createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .lean(),
    User.countDocuments(query),
  ]);

  res.json({ items, total, page: pg, limit: lim });
};

// Campos de perfil que el usuario puede editar libremente (whitelist anti mass-assignment).
const PROFILE_FIELDS = ['avatarUrl', 'phone', 'bio', 'firstName', 'lastName', 'age', 'occupation', 'housingType', 'orgName', 'website'] as const;
const ADDRESS_FIELDS = ['street', 'city', 'postalCode', 'region', 'country'] as const;

function sanitizeProfile(input: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of PROFILE_FIELDS) {
    if (input[key] === undefined) continue;
    if (key === 'age') {
      const n = Number(input.age);
      if (Number.isFinite(n) && n >= 0 && n <= 120) out.age = Math.round(n);
      else if (input.age === null || input.age === '') out.age = undefined;
      continue;
    }
    if (key === 'housingType') {
      out.housingType = input.housingType === 'casa' || input.housingType === 'piso' ? input.housingType : undefined;
      continue;
    }
    out[key] = typeof input[key] === 'string' ? input[key].trim() : input[key];
  }
  if (input.address && typeof input.address === 'object') {
    const addr: Record<string, any> = {};
    for (const key of ADDRESS_FIELDS) {
      if (input.address[key] !== undefined) addr[key] = typeof input.address[key] === 'string' ? input.address[key].trim() : input.address[key];
    }
    out.address = addr;
  }
  if (input.vet && typeof input.vet === 'object') {
    const v: Record<string, any> = {};
    if (typeof input.vet.licenseNumber === 'string') v.licenseNumber = input.vet.licenseNumber.trim();
    if (typeof input.vet.schedule === 'string') v.schedule = input.vet.schedule.trim().slice(0, 300);
    if (input.vet.emergency24h !== undefined) v.emergency24h = !!input.vet.emergency24h;
    const toCleanArray = (val: any) =>
      Array.isArray(val) ? val.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 20) : undefined;
    const specialties = toCleanArray(input.vet.specialties);
    const services = toCleanArray(input.vet.services);
    if (specialties) v.specialties = specialties;
    if (services) v.services = services;
    out.vet = v;
  }
  if (input.autoDonate && typeof input.autoDonate === 'object') {
    const ad: Record<string, any> = { enabled: !!input.autoDonate.enabled };
    if (input.autoDonate.shelterId && /^[a-f\d]{24}$/i.test(String(input.autoDonate.shelterId))) {
      ad.shelterId = String(input.autoDonate.shelterId);
    } else if (input.autoDonate.shelterId === null || input.autoDonate.shelterId === '') {
      ad.shelterId = undefined;
    }
    out.autoDonate = ad;
  }
  return out;
}

/**
 * Update user information by id. A user can only edit their own record (admins can edit anyone).
 * Only name, email and the profile subdocument are editable here — role, patitas, Stripe ids and
 * tenantPro are intentionally NOT mutable through this endpoint (mass-assignment hardening).
 * Password updates go through the dedicated auth flow.
 */
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requester: any = (req as any).user || {};
    const requesterId = String(requester._id || requester.id || '');
    const isAdmin = requester.role === 'admin';
    if (!isAdmin && requesterId !== String(id)) {
      return res.status(403).json({ error: 'No puedes editar este perfil' });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const body: any = req.body || {};
    if (typeof body.name === 'string' && body.name.trim()) user.name = body.name.trim();
    if (typeof body.email === 'string' && body.email.trim()) user.email = body.email.trim().toLowerCase();

    if (body.profile && typeof body.profile === 'object') {
      const current: any = (user.get('profile') as any) || {};
      const currentObj = typeof current.toObject === 'function' ? current.toObject() : { ...current };
      const incoming = sanitizeProfile(body.profile);
      const mergedAddress = { ...(currentObj.address || {}), ...(incoming.address || {}) };
      user.set('profile', { ...currentObj, ...incoming, address: mergedAddress });
    }

    await user.save();
    const safe = user.toObject();
    delete (safe as any).passwordHash;
    res.json(safe);
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Ese email ya está en uso' });
    }
    getRequestLogger(req).error({ err: error, userId: req.params.id }, 'Error al actualizar el usuario');
    res.status(500).json({ error: 'Error al actualizar el usuario' });
  }
};
