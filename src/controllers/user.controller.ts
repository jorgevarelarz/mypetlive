import { Request, Response } from 'express';
import crypto from 'crypto';
import { User } from '../models/user.model';
import getRequestLogger from '../utils/requestLogger';
import { escapeRegex } from '../utils/regex';
import { AppError, isAppError } from '../utils/errors';
import { sendEmail } from '../utils/notification';
import { confirmEmailChangeEmail, emailChangeNoticeEmail } from '../utils/emailTemplates';

// Ventana de confirmación del cambio de email. Más larga que la de reseteo de
// contraseña (60 min) a propósito: aquí no hay una urgencia que empuje a mirar
// el buzón, la persona solo ha editado su perfil.
const EMAIL_CHANGE_TTL_HOURS = 24;

function buildEmailConfirmLink(token: string) {
  const encoded = encodeURIComponent(token);
  const base = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/perfil/confirmar-email?token=${encoded}`;
}

// Los avisos no pueden tumbar la operación: si el correo falla, el cambio sigue
// su curso y queda el log.
async function notifyOldAddress(oldEmail: string, newEmail: string, applied: boolean, req: Request) {
  try {
    const { text, html } = emailChangeNoticeEmail(newEmail, applied);
    const subject = applied ? 'Tu correo de acceso ha cambiado — MyPetLive' : 'Alguien ha pedido cambiar tu correo — MyPetLive';
    await sendEmail(oldEmail, subject, text, html);
  } catch (error) {
    getRequestLogger(req).error({ err: error }, 'No se pudo avisar a la dirección anterior del cambio de email');
  }
}

/**
 * Deja el cambio en estado pendiente y manda los dos correos: el enlace a la
 * dirección nueva y el aviso a la antigua. No toca `user.email`.
 */
async function startEmailChange(user: any, nextEmail: string, req: Request) {
  // Se comprueba aquí además del índice único, porque el índice no se dispara
  // hasta que se confirma y para entonces ya sería tarde para avisar bien.
  const taken = await User.findOne({ email: nextEmail }).select('_id').lean();
  if (taken) throw new AppError('Ese email ya está en uso', { status: 409, code: 'email_taken' });

  const token = crypto.randomBytes(32).toString('hex');
  user.set('pendingEmail', nextEmail);
  user.set('pendingEmailToken', token);
  user.set('pendingEmailExp', new Date(Date.now() + EMAIL_CHANGE_TTL_HOURS * 60 * 60 * 1000));

  const { text, html } = confirmEmailChangeEmail(buildEmailConfirmLink(token), EMAIL_CHANGE_TTL_HOURS);
  try {
    await sendEmail(nextEmail, 'Confirma tu nueva dirección — MyPetLive', text, html);
  } catch (error) {
    getRequestLogger(req).error({ err: error }, 'No se pudo enviar la confirmación del cambio de email');
  }
  await notifyOldAddress(user.email, nextEmail, false, req);
}

/**
 * Aplica un cambio de email pendiente. Público a propósito: quien pulsa el
 * enlace desde el buzón nuevo puede no tener sesión abierta ahí, y el token ya
 * demuestra que controla esa dirección.
 */
export const confirmEmailChange = async (req: Request, res: Response) => {
  const token = String((req.body || {}).token || (req.query || {}).token || '');
  if (!token) return res.status(400).json({ error: 'token_required' });

  const user = await User.findOne({
    pendingEmailToken: token,
    pendingEmailExp: { $gt: new Date() },
  }).select('+pendingEmail +pendingEmailToken +pendingEmailExp');

  if (!user) return res.status(400).json({ error: 'token_invalid' });

  const pending = String((user as any).get('pendingEmail') || '');
  if (!pending) return res.status(400).json({ error: 'token_invalid' });

  // Alguien pudo registrarse con esa dirección entre la petición y el clic.
  const taken = await User.findOne({ email: pending, _id: { $ne: user._id } }).select('_id').lean();
  if (taken) return res.status(409).json({ error: 'email_taken' });

  const previous = user.email;
  user.email = pending;
  user.set('pendingEmail', undefined);
  user.set('pendingEmailToken', undefined);
  user.set('pendingEmailExp', undefined);
  await user.save();

  await notifyOldAddress(previous, pending, true, req);
  res.json({ ok: true, email: user.email });
};

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
    const term = escapeRegex(String(q).trim());
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
    if (Array.isArray(input.vet.serviceCatalog)) {
      v.serviceCatalog = input.vet.serviceCatalog
        .map((item: any) => {
          if (!item || typeof item !== 'object') return null;
          const name = typeof item.name === 'string' ? item.name.trim().slice(0, 80) : '';
          if (!name) return null;
          const pricingType = item.pricingType === 'fijo' ? 'fijo' : 'variable';
          const price = Number(item.priceEur);
          const priceEur = Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : undefined;
          // Un servicio de precio fijo sin precio no tiene sentido: se degrada a presupuesto.
          if (pricingType === 'fijo' && priceEur === undefined) return { name, pricingType: 'variable' };
          return { name, priceEur, pricingType };
        })
        .filter(Boolean)
        .slice(0, 30);
    }
    out.vet = v;
  }
  if (Array.isArray(input.itemCatalog)) {
    out.itemCatalog = input.itemCatalog
      .map((item: any) => {
        if (!item || typeof item !== 'object') return null;
        const name = typeof item.name === 'string' ? item.name.trim().slice(0, 100) : '';
        if (!name) return null;
        const price = Number(item.priceEur);
        const priceEur = Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : undefined;
        return { name, priceEur };
      })
      .filter(Boolean)
      .slice(0, 60);
  }
  // Portes del marketplace. La lista es blanca, así que sin este bloque los
  // portes de una tienda se perderían en silencio al guardar el perfil.
  if (input.marketplace && typeof input.marketplace === 'object') {
    const m: Record<string, any> = {};
    const shipping = Number(input.marketplace.shippingEur);
    if (Number.isFinite(shipping) && shipping >= 0 && shipping <= 100) {
      m.shippingEur = Math.round(shipping * 100) / 100;
    }
    const freeFrom = Number(input.marketplace.freeFromEur);
    if (Number.isFinite(freeFrom) && freeFrom >= 0 && freeFrom <= 1000) {
      m.freeFromEur = Math.round(freeFrom * 100) / 100;
    } else if (input.marketplace.freeFromEur === null || input.marketplace.freeFromEur === '') {
      // Sin umbral no hay envío gratis nunca, que es una decisión válida.
      m.freeFromEur = undefined;
    }
    out.marketplace = m;
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

    // El email no se cambia aquí. Es la llave de la cuenta —desde él se recupera
    // la contraseña—, así que una sesión abierta bastaba para llevarse la cuenta
    // a otro buzón en silencio y desde ahí pedir "he olvidado mi contraseña".
    // Ahora hay que confirmarlo en la dirección nueva; la antigua recibe aviso.
    // Un admin sí puede cambiarlo a mano (soporte), y entonces se avisa igual.
    let emailChangeRequested = false;
    if (typeof body.email === 'string' && body.email.trim()) {
      const nextEmail = body.email.trim().toLowerCase();
      if (nextEmail !== user.email) {
        if (isAdmin && requesterId !== String(id)) {
          const previous = user.email;
          user.email = nextEmail;
          void notifyOldAddress(previous, nextEmail, true, req);
        } else {
          await startEmailChange(user, nextEmail, req);
          emailChangeRequested = true;
        }
      }
    }

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
    // `select:false` solo filtra lecturas de la base: los campos que acabamos de
    // escribir en memoria sí salen en toObject(). Sin esto el token de
    // confirmación volvía en la respuesta del PATCH, así que una sesión
    // secuestrada podía confirmar el cambio sin pisar el buzón nuevo — que es
    // exactamente lo que este flujo existe para impedir.
    delete (safe as any).pendingEmail;
    delete (safe as any).pendingEmailToken;
    delete (safe as any).pendingEmailExp;
    res.json({ ...safe, ...(emailChangeRequested ? { emailChangePending: true } : {}) });
  } catch (error: any) {
    if (isAppError(error)) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Ese email ya está en uso' });
    }
    getRequestLogger(req).error({ err: error, userId: req.params.id }, 'Error al actualizar el usuario');
    res.status(500).json({ error: 'Error al actualizar el usuario' });
  }
};
