import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { User } from '../models/user.model';
import { Animal } from '../models/animal.model';
import { Adoption } from '../models/adoption.model';
import { VetAppointment } from '../models/vetAppointment.model';
import { Order } from '../models/order.model';
import { Product } from '../models/product.model';
import { PushSubscription } from '../models/pushSubscription.model';
import { AnimalFavorite } from '../models/animalFavorite.model';
import { AnimalAlert } from '../models/animalAlert.model';
import { WelcomePlan } from '../models/welcomePlan.model';
import { Verification } from '../models/verification.model';
import { TERMINAL_ADOPTION_STATUSES } from './adoptionTransitions';
import { withTxnIfAvailable } from './txn';

/**
 * Borrado de cuenta a petición del titular (RGPD art. 17 y App Store 5.1.1(v)).
 *
 * El documento User NO se elimina: pedidos, donaciones, movimientos de Patitas,
 * aceptaciones legales y el historial de los animales lo referencian, y algunos
 * de esos registros hay que conservarlos (fiscalidad, prueba de consentimiento).
 * Lo que se hace es anonimizarlo —sin nombre, email, contraseña, perfil ni
 * proveedores de login— y subir `tokenVersion` para que ninguna sesión abierta
 * siga valiendo.
 *
 * Lo que NO se puede dejar a medias (dinero comprometido, citas, pedidos por
 * servir, adopciones de los animales de una protectora) bloquea el borrado: se
 * devuelve la lista para que la persona lo cierre o escriba a soporte.
 */

export type DeletionBlocker =
  | 'open_vet_appointments'
  | 'locked_patitas'
  | 'patitas_balance'
  | 'pending_payouts'
  | 'open_orders_as_seller'
  | 'open_orders_as_buyer'
  | 'open_adoptions_as_shelter'
  | 'admin_account';

const OPEN_APPOINTMENT = ['requested', 'confirmed', 'rescheduled'];
const OPEN_ORDER = ['paid', 'shipped'];
const PROFESSIONAL_ROLES = ['landlord', 'vet', 'store'];

export async function findDeletionBlockers(userId: string): Promise<DeletionBlocker[]> {
  const user: any = await User.findById(userId).select('role patitas patitasLocked').lean();
  if (!user) return [];
  const id = new Types.ObjectId(userId);
  const blockers: DeletionBlocker[] = [];

  // Un admin que se borra a sí mismo puede dejar la plataforma sin administración.
  if (user.role === 'admin') blockers.push('admin_account');

  const [appointments, payouts, asSeller, asBuyer] = await Promise.all([
    VetAppointment.countDocuments({ $or: [{ userId: id }, { vetId: id }], status: { $in: OPEN_APPOINTMENT } }),
    VetAppointment.countDocuments({ vetId: id, payoutStatus: 'pending_payout', patitasPaid: true }),
    Order.countDocuments({ sellerId: id, status: { $in: OPEN_ORDER } }),
    Order.countDocuments({ 'buyer.userId': id, status: { $in: OPEN_ORDER } }),
  ]);
  if (appointments > 0) blockers.push('open_vet_appointments');
  if ((user.patitasLocked || 0) > 0) blockers.push('locked_patitas');
  if (payouts > 0) blockers.push('pending_payouts');
  if (asSeller > 0) blockers.push('open_orders_as_seller');
  if (asBuyer > 0) blockers.push('open_orders_as_buyer');

  if (user.role === 'landlord') {
    // Las Patitas de una protectora valen dinero (se canjean en partners): no se
    // tiran por borrar la cuenta. Las de un adoptante son puntos y sí se pierden.
    if ((user.patitas || 0) > 0) blockers.push('patitas_balance');
    const animalIds = await Animal.find({ shelter: id }).distinct('_id');
    const openAdoptions = animalIds.length
      ? await Adoption.countDocuments({
        animalId: { $in: animalIds.map(String) },
        status: { $nin: TERMINAL_ADOPTION_STATUSES },
      })
      : 0;
    if (openAdoptions > 0) blockers.push('open_adoptions_as_shelter');
  }
  return blockers;
}

export async function deleteAccount(userId: string): Promise<void> {
  const id = new Types.ObjectId(userId);
  const user: any = await User.findById(id).select('role');
  if (!user) return;

  // Hash de un secreto que nadie conoce: el esquema exige passwordHash cuando no
  // hay proveedores de login, y quitarlo haría fallar cualquier save() posterior.
  const unusableHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

  await withTxnIfAvailable(async session => {
    const opts = session ? { session } : {};

    // 1) Candidaturas abiertas como adoptante: se cancelan y, si su animal
    //    estaba reservado por el proceso, vuelve a estar disponible.
    const open = await Adoption.find({ adopterId: userId, status: { $nin: TERMINAL_ADOPTION_STATUSES } }, null, opts);
    for (const app of open) {
      app.status = 'cancelada';
      app.history.push({ ts: new Date(), actorId: userId, action: 'status_change', payload: { status: 'cancelada', note: 'Cuenta eliminada por el adoptante' } } as any);
      await app.save(opts);
      const others = await Adoption.countDocuments({
        animalId: app.animalId, _id: { $ne: app._id }, status: { $in: ['cita_propuesta', 'preaprobada'] },
      }).session(session ?? null);
      if (others === 0) {
        await Animal.updateOne({ _id: app.animalId, status: 'reservado' }, { status: 'publicado' }, opts);
      }
    }
    // Las respuestas al cuestionario son datos personales: fuera en todo lo que
    // no sea una adopción cerrada (la protectora conserva el expediente de esa).
    await Adoption.updateMany({ adopterId: userId, status: { $ne: 'aprobada' } }, { $set: { answers: [] } }, opts);

    // 2) Mascotas propias: se archivan sin dueño. No se borran porque su código,
    //    pasaporte e historial pueden venir de una protectora.
    await Animal.updateMany({ ownerId: id }, { $set: { ownerId: null, status: 'archivado' } }, opts);
    if (PROFESSIONAL_ROLES.includes(user.role)) {
      await Animal.updateMany({ shelter: id, status: { $nin: ['adoptado', 'archivado'] } }, { $set: { status: 'archivado' } }, opts);
      await Product.updateMany({ sellerId: id }, { $set: { active: false } }, opts);
    }

    // 3) Lo que solo existe para esta persona.
    await Promise.all([
      PushSubscription.deleteMany({ userId }, opts),
      AnimalFavorite.deleteMany({ userId: id }, opts),
      AnimalAlert.deleteMany({ userId: id }, opts),
      WelcomePlan.deleteMany({ ownerId: id }, opts),
      Verification.deleteMany({ userId }, opts),
    ]);

    // 4) Anonimizar. El email inventado mantiene el índice único y nunca puede
    //    recibir correo ni coincidir con un alta nueva (.invalid es reservado).
    await User.updateOne(
      { _id: id },
      {
        $set: {
          name: 'Usuario eliminado',
          email: `eliminado-${userId}-${crypto.randomBytes(4).toString('hex')}@mypetlive.invalid`,
          deletedAt: new Date(),
          patitas: 0,
          authProviders: [],
          passwordHash: unusableHash,
        },
        $unset: {
          profile: 1, tenantPro: 1, stripeCustomerId: 1, stripeAccountId: 1,
          resetToken: 1, resetTokenExp: 1, pendingEmail: 1, pendingEmailToken: 1, pendingEmailExp: 1,
          calendarFeedToken: 1, posApiKeyHash: 1, posApiKeyPrefix: 1, posApiKeys: 1,
        },
        $inc: { tokenVersion: 1 },
      },
      opts,
    );
  });
}
