import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/user.model';
import { deleteAccount, findDeletionBlockers } from '../utils/accountDeletion';
import { sendEmail } from '../utils/email';
import logger from '../utils/logger';

function actorId(req: Request): string {
  const u: any = (req as any).user;
  return String(u?._id || u?.id || '');
}

// GET /api/auth/account/deletion-check — qué impide borrar la cuenta ahora mismo.
export async function deletionCheck(req: Request, res: Response) {
  const id = actorId(req);
  const [blockers, user] = await Promise.all([
    findDeletionBlockers(id),
    User.findById(id).select('passwordHash').lean(),
  ]);
  // confirmWith: qué tiene que escribir la persona para confirmar (las cuentas
  // creadas con Google/Apple no tienen contraseña).
  return res.json({
    canDelete: blockers.length === 0,
    blockers,
    confirmWith: (user as any)?.passwordHash ? 'password' : 'email',
  });
}

// POST /api/auth/account/delete { password } | { confirmEmail }
// Se pide la contraseña otra vez (o el email, en cuentas de Google/Apple sin
// contraseña): una sesión olvidada abierta no debe bastar para borrar la cuenta.
export async function deleteMyAccount(req: Request, res: Response) {
  const id = actorId(req);
  const user: any = await User.findById(id).select('passwordHash email name deletedAt');
  if (!user || user.deletedAt) return res.status(404).json({ error: 'not_found' });

  const { password, confirmEmail } = req.body || {};
  if (user.passwordHash) {
    if (typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(400).json({ error: 'invalid_password' });
    }
  } else if (typeof confirmEmail !== 'string' || confirmEmail.trim().toLowerCase() !== String(user.email).toLowerCase()) {
    return res.status(400).json({ error: 'email_mismatch' });
  }

  const blockers = await findDeletionBlockers(id);
  if (blockers.length) return res.status(409).json({ error: 'account_has_pending', blockers });

  const { email, name } = user;
  await deleteAccount(id);
  logger.info({ userId: id }, '[account] cuenta eliminada por su titular');
  try {
    await sendEmail(
      email,
      'Tu cuenta de MyPetLive se ha eliminado',
      `Hola${name ? ` ${name}` : ''}:\n\nHemos eliminado tu cuenta de MyPetLive y tus datos personales, como nos pediste. ` +
        'Conservamos solo lo que la ley nos obliga a guardar (pedidos, donaciones y aceptaciones legales), sin tu nombre ni tu correo.\n\n' +
        'Si no has sido tú, escríbenos a soporte@mypetlive.es.\n\nEl equipo de MyPetLive',
    );
  } catch (err) {
    logger.warn({ err, userId: id }, '[account] no se pudo enviar el aviso de cuenta eliminada');
  }
  return res.json({ ok: true });
}
