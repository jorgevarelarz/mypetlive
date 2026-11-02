import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { assertRole } from '../middleware/assertRole';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/animal.controller';
import { animalCreateSchema, animalUpdateSchema, animalStatusSchema, personalPetUpdateSchema } from '../validators/animal.schema';
import asyncHandler from '../utils/asyncHandler';
import { markFeeding, markLitter, markWalk, listCare, upsertSupply, updateCareReminders } from '../controllers/animalCare.controller';
import * as memorial from '../controllers/memorial.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import * as favoriteCtrl from '../controllers/animalFavorite.controller';
import * as alertCtrl from '../controllers/animalAlert.controller';
import * as sharing from '../controllers/petSharing.controller';

const r = Router();

// Create/Update by shelter (temporarily using landlord/admin roles)
r.post('/', ...assertRole('landlord', 'admin'), validate(animalCreateSchema), asyncHandler(ctrl.create));
r.put('/:id', ...assertRole('landlord', 'admin'), validate(animalUpdateSchema), asyncHandler(ctrl.update));
r.patch('/:id/status', ...assertRole('landlord', 'protectora', 'admin'), validate(animalStatusSchema), asyncHandler(ctrl.updateStatus));
r.delete('/:id', ...assertRole('landlord', 'admin'), asyncHandler(ctrl.remove));

r.post('/personal', authenticate, asyncHandler(ctrl.createPersonal));
r.get('/mine', authenticate, asyncHandler(ctrl.listMine));
// Editar la ficha de una mascota propia (nombre, edad, ánimo, fotos…). Separado
// de `PUT /:id`, que es el de las protectoras: quien edita aquí es la familia,
// con rol tenant, y solo puede tocar campos descriptivos.
r.put('/mine/:id', authenticate, validate(personalPetUpdateSchema), asyncHandler(ctrl.updateMine));
r.get('/favorites', authenticate, asyncHandler(favoriteCtrl.list));
r.post('/favorites/import', authenticate, asyncHandler(favoriteCtrl.addMany));
r.post('/:id/favorite', authenticate, asyncHandler(favoriteCtrl.add));
r.delete('/:id/favorite', authenticate, asyncHandler(favoriteCtrl.remove));
r.get('/alerts', authenticate, asyncHandler(alertCtrl.list));
r.post('/alerts', authenticate, asyncHandler(alertCtrl.create));
r.patch('/alerts/:id', authenticate, asyncHandler(alertCtrl.update));
r.delete('/alerts/:id', authenticate, asyncHandler(alertCtrl.remove));

// Modo perdido. Con `authenticate` y no `assertRole`: quien pierde a su animal
// suele ser un adoptante (rol tenant), no una protectora. Quién puede tocarlo lo
// decide `canManageAnimal` mirando shelter/ownerId.
r.post('/:id/lost', authenticate, asyncHandler(ctrl.markLost));
r.post('/:id/found', authenticate, asyncHandler(ctrl.markFound));
r.get('/:id/sightings', authenticate, asyncHandler(ctrl.listSightings));

// Public
r.get('/code/:code', authenticate, asyncHandler(ctrl.getByCode));
// Pasaporte público por código + línea de tiempo (auth opcional: dueño/admin ven más)
r.get('/passport/:code', asyncHandler(ctrl.getPassport));
// Aviso de avistamiento: escritura anónima que además dispara un correo, así que
// va limitada por IP. El límite es generoso porque un hallazgo real puede
// implicar varios intentos desde el mismo móvil.
const sightingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
r.post('/passport/:code/sighting', sightingLimiter, asyncHandler(ctrl.reportSighting));
// Mural «en su memoria»: velas y mensajes desde el QR, sin sesión.
const candleLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
const memorialMessageLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
r.post('/passport/:code/candle', candleLimiter, asyncHandler(memorial.lightCandle));
r.post('/passport/:code/memorial-message', memorialMessageLimiter, asyncHandler(memorial.leaveMessage));
// La familia: despedirla, deshacerlo y llenar el mural.
r.get('/:id/memorial', authenticate, asyncHandler(memorial.getMemorialForFamily));
r.post('/:id/memorial', authenticate, asyncHandler(memorial.startMemorial));
r.delete('/:id/memorial', authenticate, asyncHandler(memorial.stopMemorial));
r.put('/:id/memorial', authenticate, asyncHandler(memorial.updateMemorial));
r.post('/:id/memorial/media', authenticate, asyncHandler(memorial.addMemorialMedia));
r.delete('/:id/memorial/media', authenticate, asyncHandler(memorial.removeMemorialMedia));
r.post('/:id/memorial/memories', authenticate, asyncHandler(memorial.addMemory));
r.delete('/:id/memorial/memories/:memoryId', authenticate, asyncHandler(memorial.removeMemory));
r.patch('/:id/memorial/messages/:messageId', authenticate, asyncHandler(memorial.setMessageStatus));
r.delete('/:id/memorial/messages/:messageId', authenticate, asyncHandler(memorial.deleteMessage));
// Mascota compartida: quién más la cuida. Invitar y quitar es del dueño; un
// miembro puede salirse (`members/me`). Las invitaciones mandan correo: limitadas.
// Por persona, no por IP: en una casa todos salen por la misma.
const familyInviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.PET_INVITE_HOURLY_LIMIT || 20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => String(req.user?._id || req.user?.id || req.ip),
});
r.get('/:id/family', authenticate, asyncHandler(sharing.getFamily));
r.post('/:id/family/invites', authenticate, familyInviteLimiter, asyncHandler(sharing.invite));
r.delete('/:id/family/invites/:inviteId', authenticate, asyncHandler(sharing.revokeInvite));
r.delete('/:id/family/members/:userId', authenticate, asyncHandler(sharing.removeMember));
r.get('/:code/timeline', optionalAuthenticate, asyncHandler(ctrl.getTimeline));
// Registro clínico del animal por su código. El control de quién puede escribir
// vive en el controlador y no aquí: además del vet y el admin, puede la familia
// del animal (`canManageAnimal`), y eso depende del animal, no solo del rol.
r.post('/:code/health', authenticate, asyncHandler(ctrl.addHealthRecord));
// Corregir o borrar una entrada (la familia, lo suyo; la clínica, lo suyo).
r.patch('/:code/health/:entryId', authenticate, asyncHandler(ctrl.updateHealthRecord));
r.delete('/:code/health/:entryId', authenticate, asyncHandler(ctrl.deleteHealthRecord));
r.get('/:id', optionalAuthenticate, asyncHandler(ctrl.getById));
r.get('/', optionalAuthenticate, asyncHandler(ctrl.search));
r.post('/:id/care/feed', ...assertRole('tenant', 'landlord', 'protectora', 'admin'), asyncHandler(markFeeding));
r.post('/:id/care/litter', ...assertRole('tenant', 'landlord', 'protectora', 'admin'), asyncHandler(markLitter));
// El paseo es el equivalente perruno del arenero, y el que más detalle admite.
r.post('/:id/care/walk', ...assertRole('tenant', 'landlord', 'protectora', 'admin'), asyncHandler(markWalk));
// Registro y resumen semanal: sin esto, marcar distancia y minutos no serviría de nada.
r.get('/:id/care', ...assertRole('tenant', 'landlord', 'protectora', 'admin'), asyncHandler(listCare));
// Despensa: alta, edición, reposición y baja de un producto (para saber para
// cuántas comidas queda, no solo cómo se llama).
r.put('/:id/care/supplies', ...assertRole('tenant', 'landlord', 'protectora', 'admin'), asyncHandler(upsertSupply));
// Recordatorios de comida, paseo y arena (notificación al móvil, ver jobs/careReminders).
r.put('/:id/care/reminders', ...assertRole('tenant', 'landlord', 'protectora', 'admin'), asyncHandler(updateCareReminders));

export default r;
