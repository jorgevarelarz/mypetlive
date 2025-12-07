import { Request, Response } from 'express';
import { Property } from '../models/property.model';
import { UserFavorite } from '../models/userFavorite.model';
import { AlertSubscription } from '../models/alertSubscription.model';
import { Application } from '../models/application.model';
import { sendAvailabilityAlert, sendPriceAlert } from '../utils/email';
import { User } from '../models/user.model';
import mongoose from 'mongoose';
import { ensureStripeCustomerForUser } from '../core/stripeCustomer';
import getRequestLogger from '../utils/requestLogger';

export async function create(req: Request, res: Response) {
  const b: any = req.body;
  const actor: any = (req as any).user;
  const ownerId = actor?._id || actor?.id;
  if (!ownerId) return res.status(401).json({ error: 'unauthorized' });
  const coords: [number, number] = [b.location.lng, b.location.lat];
  const payload: any = {
    ...b,
    owner: ownerId,
    location: { type: 'Point', coordinates: coords },
    status: 'draft',
  };
  if (payload.onlyTenantPro && (!payload.requiredTenantProMaxRent || payload.requiredTenantProMaxRent === 0)) {
    payload.requiredTenantProMaxRent = payload.price;
  }
  const doc = await Property.create(payload);
  res.status(201).json(doc);
}

export async function update(req: Request, res: Response) {
  const { id } = req.params;
  const prev = await Property.findById(id);
  if (!prev) return res.status(404).json({ error: 'not_found' });

  const b: any = req.body;
  // Prevent changing owner through payload
  delete b.owner;
  if (b.location) b.location = { type: 'Point', coordinates: [b.location.lng, b.location.lat] };

  const actor: any = (req as any).user;
  const actorId = actor?._id || actor?.id;
  const isAdmin = actor?.role === 'admin';
  const isOwner = actorId && String(prev.owner) === String(actorId);
  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'forbidden' });
  }

  if (b.onlyTenantPro) {
    const required = Number(b.requiredTenantProMaxRent ?? 0);
    if (!required) {
      b.requiredTenantProMaxRent = b.price ?? prev.price;
    }
  }

  const updated = await Property.findByIdAndUpdate(id, b, { new: true });
  if (!updated) return res.status(404).json({ error: 'not_found' });

  const priceChanged = prev.price !== updated.price;

  const prevAvailableFrom = prev.availableFrom ? String(prev.availableFrom) : null;
  const updatedAvailableFrom = updated.availableFrom ? String(updated.availableFrom) : null;
  const prevAvailableTo = prev.availableTo ? String(prev.availableTo) : null;
  const updatedAvailableTo = updated.availableTo ? String(updated.availableTo) : null;
  const availabilityChanged =
    prevAvailableFrom !== updatedAvailableFrom || prevAvailableTo !== updatedAvailableTo;

  if (priceChanged) {
    const subs = await AlertSubscription.find({ propertyId: id, type: 'price' });
    for (const s of subs) {
      await sendPriceAlert(String(s.userId), updated);
    }
  }

  if (availabilityChanged) {
    const subs = await AlertSubscription.find({ propertyId: id, type: 'availability' });
    for (const s of subs) {
      await sendAvailabilityAlert(String(s.userId), updated);
    }
  }

  res.json(updated);
}

export async function publish(req: Request, res: Response) {
  const { id } = req.params;
  const p = await Property.findById(id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const user: any = (req as any).user;
  const userId = user?._id ?? user?.id;
  const isOwner = userId ? String(userId) === String(p.owner) : false;
  const isAdmin = user?.role === 'admin';
  if (!isAdmin && (!isOwner || !user?.isVerified)) {
    return res.status(403).json({ error: 'owner_not_verified' });
  }
  if ((p.images?.length || 0) < 3) return res.status(400).json({ error: 'min_images_3' });
  const ownerId = String(p.owner);
  const otherActiveCount = await Property.countDocuments({ owner: p.owner, status: 'active', _id: { $ne: p._id } });
  if (otherActiveCount === 0) {
    await ensureStripeCustomerForUser(ownerId, 'property_publish');
  }
  p.status = 'active';
  await p.save();
  res.json({ _id: p._id, status: p.status });
}

export async function archive(req: Request, res: Response) {
  const actor: any = (req as any).user;
  const p = await Property.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const actorId = actor?._id || actor?.id;
  const isAdmin = actor?.role === 'admin';
  const isOwner = actorId && String(p.owner) === String(actorId);
  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'forbidden' });
  }
  p.status = 'archived';
  await p.save();
  res.json({ _id: p._id, status: p.status });
}

export async function getById(req: Request, res: Response) {
  const p = await Property.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  res.json(p);
}

export async function search(req: Request, res: Response) {
  const q: any = {};
  const {
    q: text,
    region,
    city,
    priceMin,
    priceMax,
    roomsMin,
    roomsMax,
    bathMin,
    furnished,
    petsAllowed,
    availableDate,
    nearLng,
    nearLat,
    maxKm,
    sort = 'createdAt',
    dir = 'desc',
    page = '1',
    limit = '20',
    onlyTenantPro,
    onlyPro,
    status,
  } = req.query as any;

  if (region) q.region = String(region).toLowerCase();
  if (city) q.city = city;
  if (priceMin || priceMax) q.price = { ...(priceMin ? { $gte: +priceMin } : {}), ...(priceMax ? { $lte: +priceMax } : {}) };
  if (roomsMin || roomsMax) q.rooms = { ...(roomsMin ? { $gte: +roomsMin } : {}), ...(roomsMax ? { $lte: +roomsMax } : {}) };
  if (bathMin) q.bathrooms = { $gte: +bathMin };
  if (furnished !== undefined) q.furnished = furnished === 'true';
  if (petsAllowed !== undefined) q.petsAllowed = petsAllowed === 'true';
  if (availableDate) q.availableFrom = { $lte: new Date(String(availableDate)) };
  const onlyProParam =
    onlyTenantPro !== undefined ? onlyTenantPro : (onlyPro !== undefined ? onlyPro : undefined);
  if (onlyProParam !== undefined) {
    q.onlyTenantPro = ['true', '1', 'yes', 'on'].includes(String(onlyProParam).toLowerCase());
  }
  if (status) q.status = String(status);
  if (text) {
    const safe = String(text).trim();
    if (safe) {
      q.$or = [
        { title: { $regex: safe, $options: 'i' } },
        { city: { $regex: safe, $options: 'i' } },
        { address: { $regex: safe, $options: 'i' } },
      ];
    }
  }

  let geo: any = {};
  if (nearLng && nearLat && maxKm) {
    geo = {
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [Number(nearLng), Number(nearLat)] },
          $maxDistance: Number(maxKm) * 1000,
        },
      },
    };
  }

  const sortSpec: [string, 1 | -1][] = [[String(sort), String(dir).toLowerCase() === 'asc' ? 1 : -1]];
  const pg = Math.max(1, parseInt(String(page)));
  const lim = Math.min(50, Math.max(1, parseInt(String(limit))));

  const hasGeo = Boolean((geo as any).location);
  if (hasGeo) {
    await Property.init();
  }

  const finder = Property.find({ ...q, ...geo });
  if (!hasGeo) {
    finder.sort(sortSpec);
  }

  const items = await finder.skip((pg - 1) * lim).limit(lim);
  const total = hasGeo ? items.length : await Property.countDocuments({ ...q, ...geo });

  res.json({ items, page: pg, limit: lim, total });
}

export async function favorite(req: Request, res: Response) {
  const userId = (req as any).user.id;
  const { id: propertyId } = req.params;
  const result = await UserFavorite.updateOne({ userId, propertyId }, {}, { upsert: true });
  if (result.upsertedCount) {
    await Property.findByIdAndUpdate(propertyId, { $inc: { favoritesCount: 1 } });
  }
  res.json({ ok: true });
}

export async function unfavorite(req: Request, res: Response) {
  const userId = (req as any).user.id;
  const { id: propertyId } = req.params;
  const del = await UserFavorite.deleteOne({ userId, propertyId });
  if (del.deletedCount) await Property.findByIdAndUpdate(propertyId, { $inc: { favoritesCount: -1 } });
  res.json({ ok: true });
}

export async function subscribePriceAlert(req: Request, res: Response) {
  const userId = (req as any).user.id;
  const { id: propertyId } = req.params;
  await AlertSubscription.updateOne({ userId, propertyId, type: 'price' }, {}, { upsert: true });
  res.json({ ok: true });
}

export async function unsubscribePriceAlert(req: Request, res: Response) {
  const userId = (req as any).user.id;
  const { id: propertyId } = req.params;
  await AlertSubscription.deleteOne({ userId, propertyId, type: 'price' });
  res.json({ ok: true });
}

export async function countView(req: Request, res: Response) {
  await Property.findByIdAndUpdate(req.params.id, { $inc: { viewsCount: 1 } });
  res.json({ ok: true });
}

export async function listFavorites(req: Request, res: Response) {
  const userId = (req as any).user?._id || (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const favorites = await UserFavorite.find({ userId: new mongoose.Types.ObjectId(String(userId)) })
    .select('propertyId -_id')
    .lean();
  const propertyIds = favorites.map(fav => fav.propertyId);
  if (propertyIds.length === 0) {
    return res.json({ items: [] });
  }

  const properties = await Property.find({ _id: { $in: propertyIds } })
    .sort({ updatedAt: -1 })
    .lean();

  const serialized = properties.map(p => ({
    id: String(p._id),
    title: p.title,
    city: p.city,
    price: p.price,
    status: p.status,
    onlyTenantPro: p.onlyTenantPro,
    requiredTenantProMaxRent: p.requiredTenantProMaxRent,
    coverImage: Array.isArray(p.images) ? p.images[0] : null,
  }));

  res.json({ items: serialized });
}

export async function apply(req: Request, res: Response) {
  const log = getRequestLogger(req);
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ error: 'not_found' });

  const userId = (req as any).user?._id || (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  if (property.onlyTenantPro) {
    const required = property.requiredTenantProMaxRent || property.price;
    const userDoc: any = userId ? await User.findById(userId) : null;
    const userMax = userDoc?.tenantPro?.maxRent || 0;
    if (!userDoc?.tenantPro || userDoc.tenantPro.status !== 'verified' || userMax < required) {
      return res.status(403).json({
        error: 'ONLY_TENANT_PRO',
        message: `Requiere inquilino PRO ≥ ${required} €/mes. Tu validación: ${userMax} €/mes.`,
      });
    }
  }

  const existing = await Application.findOne({ propertyId: String(property._id), tenantId: String(userId) });
  if (existing) {
    log.info(
      { tenantId: String(userId), propertyId: String(property._id), status: existing.status },
      '[applications] apply already exists',
    );
    return res.json({ ok: true, propertyId: property._id, status: existing.status });
  }

  const created = await Application.create({
    propertyId: String(property._id),
    tenantId: String(userId),
    status: 'pending',
  });

  log.info(
    {
      tenantId: String(userId),
      propertyId: String(property._id),
      applicationId: String(created._id),
    },
    '[applications] apply created',
  );

  res.json({ ok: true, propertyId: property._id, status: 'pending' });
}
