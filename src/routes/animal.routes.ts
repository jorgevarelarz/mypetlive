import { Router } from 'express';
import { assertRole } from '../middleware/assertRole';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/animal.controller';
import { animalCreateSchema, animalUpdateSchema, animalStatusSchema } from '../validators/animal.schema';
import asyncHandler from '../utils/asyncHandler';
import { markFeeding, markLitter } from '../controllers/animalCare.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import * as favoriteCtrl from '../controllers/animalFavorite.controller';
import * as alertCtrl from '../controllers/animalAlert.controller';

const r = Router();

// Create/Update by shelter (temporarily using landlord/admin roles)
r.post('/', ...assertRole('landlord', 'admin'), validate(animalCreateSchema), asyncHandler(ctrl.create));
r.put('/:id', ...assertRole('landlord', 'admin'), validate(animalUpdateSchema), asyncHandler(ctrl.update));
r.patch('/:id/status', ...assertRole('landlord', 'protectora', 'admin'), validate(animalStatusSchema), asyncHandler(ctrl.updateStatus));
r.delete('/:id', ...assertRole('landlord', 'admin'), asyncHandler(ctrl.remove));

r.post('/personal', authenticate, asyncHandler(ctrl.createPersonal));
r.get('/mine', authenticate, asyncHandler(ctrl.listMine));
r.get('/favorites', authenticate, asyncHandler(favoriteCtrl.list));
r.post('/favorites/import', authenticate, asyncHandler(favoriteCtrl.addMany));
r.post('/:id/favorite', authenticate, asyncHandler(favoriteCtrl.add));
r.delete('/:id/favorite', authenticate, asyncHandler(favoriteCtrl.remove));
r.get('/alerts', authenticate, asyncHandler(alertCtrl.list));
r.post('/alerts', authenticate, asyncHandler(alertCtrl.create));
r.patch('/alerts/:id', authenticate, asyncHandler(alertCtrl.update));
r.delete('/alerts/:id', authenticate, asyncHandler(alertCtrl.remove));

// Public
r.get('/code/:code', authenticate, asyncHandler(ctrl.getByCode));
// Pasaporte público por código + línea de tiempo (auth opcional: dueño/admin ven más)
r.get('/passport/:code', asyncHandler(ctrl.getPassport));
r.get('/:code/timeline', optionalAuthenticate, asyncHandler(ctrl.getTimeline));
r.get('/:id', asyncHandler(ctrl.getById));
r.get('/', optionalAuthenticate, asyncHandler(ctrl.search));
r.post('/:id/care/feed', ...assertRole('tenant', 'landlord', 'protectora', 'admin'), asyncHandler(markFeeding));
r.post('/:id/care/litter', ...assertRole('tenant', 'landlord', 'protectora', 'admin'), asyncHandler(markLitter));

export default r;
