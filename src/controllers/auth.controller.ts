import { Request, Response } from 'express';
import { User } from '../models/user.model';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendEmail } from '../utils/email';
import { resetPasswordEmail } from '../utils/emailTemplates';
import getRequestLogger from '../utils/requestLogger';
import { AppError, badRequest, isAppError } from '../utils/errors';

import { getLatestLegalDoc, recordLegalAcceptance } from '../utils/legalDocs';
import { getJwtSecret } from '../config/jwt';

const normalizeEmail = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const JWT_SECRET = getJwtSecret();
const DEFAULT_FRONTEND_URL = 'http://localhost:3000';

function buildResetLink(token: string) {
  const encoded = encodeURIComponent(token);
  const template = process.env.PASSWORD_RESET_URL || process.env.PASSWORD_RESET_URL_TEMPLATE;
  if (template) {
    if (template.includes('{{TOKEN}}')) return template.replace(/{{TOKEN}}/g, encoded);
    if (template.includes('%TOKEN%')) return template.replace(/%TOKEN%/g, encoded);
    if (template.includes('{token}')) return template.replace(/{token}/g, encoded);
    try {
      const url = new URL(template);
      url.hash = `token=${encoded}`;
      return url.toString();
    } catch {
      // ignore malformed template, fall back to defaults
    }
  }

  const base =
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    DEFAULT_FRONTEND_URL;
  const normalized = base.replace(/\/$/, '');
  // El token va detrás de '#': esa parte de la URL no sale del navegador, así que
  // no llega a los logs de Apache ni de la API, ni a la cabecera Referer.
  return `${normalized}/reset#token=${encoded}`;
}

/**
 * Register a new user.
 *
 * Expects: name, email and password in the request body. Public registration
 * always creates an adoptante (tenant); professional roles are activated manually.
 */
export const register = async (req: Request, res: Response) => {
  const log = getRequestLogger(req);
  try {
    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const rawEmail = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!rawName || !rawEmail || !password) {
      throw badRequest('missing_fields');
    }
    const roleWasProvided = req.body?.role !== undefined && req.body?.role !== null;
    const requestedRole = typeof req.body?.role === 'string'
      ? req.body.role.trim().toLowerCase()
      : '';
    const adoptanteRoles = new Set(['tenant', 'adoptante']);
    const protectedRoles = new Set(['protectora', 'landlord', 'vet', 'store', 'pro', 'admin']);

    if (requestedRole && protectedRoles.has(requestedRole)) {
      throw new AppError('El alta profesional requiere activación manual', {
        status: 403,
        code: 'professional_onboarding_required',
      });
    }
    if (roleWasProvided && !adoptanteRoles.has(requestedRole)) {
      throw new AppError('Rol de registro no válido', { status: 400, code: 'invalid_role' });
    }

    const normalizedRole = 'tenant';
    // Generate the password hash
    const passwordHash = await bcrypt.hash(password, 10);
    // Save new user with hashed password
    const user = new User({ name: rawName, email: rawEmail, passwordHash, role: normalizedRole });
    await user.save();
    // Casilla «Acepto los términos y la privacidad» del formulario: se guarda
    // aquí, con IP y dispositivo, para no mandar a nadie a la pantalla de
    // aceptación justo después de registrarse. Es opcional para no romper las
    // versiones de la app ya instaladas; sin ella, /legal-consent la pide.
    if (req.body?.acceptLegal === true) {
      for (const slug of ['terms', 'privacy'] as const) {
        const latest = await getLatestLegalDoc(slug);
        if (latest) await recordLegalAcceptance(user._id, slug, latest.version, req);
      }
    }
    const token = jwt.sign({ id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: { _id: user._id, email: user.email, role: user.role },
    });
  } catch (error: any) {
    if (error?.code === 11000 || /duplicate key/i.test(error?.message || '')) {
      throw new AppError('email_in_use', { status: 409, code: 'email_in_use' });
    }
    if (isAppError(error)) throw error;
    log.error({ err: error, email: req.body?.email }, 'Error registrando usuario');
    throw badRequest('Error al registrar', { cause: (error as Error)?.message });
  }
};

/**
 * Authenticate a user and return a signed JWT.
 *
 * Expects: email and password in the request body.
 */
const INVALID_CREDENTIALS =
  'Usuario o contraseña incorrectos. Si te registraste con Google o Apple, entra con ese botón.';
// Hash de una contraseña que nadie conoce, para comparar también cuando no hay cuenta.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

export const login = async (req: Request, res: Response) => {
  const log = getRequestLogger(req);
  log.info('Login request received');
  try {
    const { password } = req.body;
    // El alta guarda el email en minúsculas; sin normalizar aquí, el móvil que pone
    // la inicial en mayúscula dejaba fuera a la usuaria con la contraseña correcta.
    const email = normalizeEmail(req.body?.email);
    const user = await User.findOne({ email });
    // Misma respuesta y mismo tiempo exista o no la cuenta, tenga contraseña o se
    // creara con Google/Apple: antes «Esta cuenta se creó con Google» y la ausencia
    // de bcrypt en cuentas inexistentes delataban qué correos tienen cuenta
    // (RentalApp 2541239). El mensaje recuerda la vía social a todos por igual.
    const hash = user?.passwordHash || DUMMY_HASH;
    const isMatch = await bcrypt.compare(String(password ?? ''), hash);
    if (!user || !user.passwordHash || !isMatch) {
      throw new AppError(INVALID_CREDENTIALS, { status: 400, code: 'invalid_credentials' });
    }
    // Generate and return JWT
    const token = jwt.sign({ id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { _id: user._id, email: user.email, role: user.role },
    });
  } catch (error) {
    if (isAppError(error)) {
      log.warn({ err: error, email: req.body?.email }, 'Login falló (error controlado)');
      throw error;
    }
    log.error({ err: error, email: req.body?.email }, 'Error durante login');
    throw new AppError('Error del servidor', { status: 500, code: 'login_failed' });
  }
};

// En la base solo se guarda el hash: quien lea la colección de usuarios (una
// copia de seguridad, un volcado) no puede usar los enlaces de recuperación.
export const hashResetToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const requestPasswordReset = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  const log = getRequestLogger(req);
  // Se responde ANTES de buscar la cuenta y mandar el correo: si se esperase,
  // el tiempo de respuesta delataría qué correos tienen cuenta (RentalApp 8d447c1).
  res.json({ ok: true });
  try {
    // Mismo motivo que en el login: sin esto, "Marina@..." no encontraba la cuenta y,
    // como la respuesta es siempre ok (no revela qué emails existen), nadie se enteraba.
    const user = await User.findOne({ email });
    if (user) {
      const token = crypto.randomBytes(20).toString('hex');
      user.resetToken = hashResetToken(token);
      user.resetTokenExp = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      const resetUrl = buildResetLink(token);
      const { text, html } = resetPasswordEmail(resetUrl);
      await sendEmail(user.email, 'Restablece tu contraseña', text, html);
    }
  } catch (error) {
    log.error({ err: error, email }, 'Error generando token de reseteo');
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const log = getRequestLogger(req);
  try {
    const { token, password } = req.body;
    if (typeof token !== 'string' || !token) {
      throw new AppError('Token inválido o expirado', { status: 400, code: 'token_invalid' });
    }
    const user = await User.findOne({
      resetToken: hashResetToken(token),
      resetTokenExp: { $gt: new Date() },
    });

    if (!user) {
      throw new AppError('Token inválido o expirado', { status: 400, code: 'token_invalid' });
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetToken = undefined;
    user.resetTokenExp = undefined;
    // Sube la versión de sesión: cualquier JWT emitido antes de este momento
    // (robado o no) deja de valer en el siguiente `authenticate`, aunque su
    // firma y su caducidad sigan siendo válidas. Es justo lo que faltaba: sin
    // esto, restablecer la contraseña no cerraba ninguna sesión ya abierta.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    res.json({ ok: true });
  } catch (error) {
    if (isAppError(error)) throw error;
    log.error({ err: error }, 'Error reseteando contraseña');
    throw new AppError('Error al restablecer la contraseña', {
      status: 500,
      code: 'reset_failed',
    });
  }
};
