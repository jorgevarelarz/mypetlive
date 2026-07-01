import { Router } from 'express';
import { assertRole } from '../middleware/assertRole';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/adoption.controller';
import { adoptionCreateSchema, adoptionStatusSchema } from '../validators/adoption.schema';
import asyncHandler from '../utils/asyncHandler';

const r = Router();

// Adoptante
r.post('/', ...assertRole('tenant', 'adoptante', 'admin'), validate(adoptionCreateSchema), asyncHandler(ctrl.create));
r.get('/mine', ...assertRole('tenant', 'adoptante', 'admin'), asyncHandler(ctrl.listMine));
r.post('/:id/cancel', ...assertRole('tenant', 'adoptante', 'admin'), asyncHandler(ctrl.cancelByAdopter));

// Protectora
r.get('/for-my-animals', ...assertRole('landlord', 'protectora', 'admin'), asyncHandler(ctrl.listForMyAnimals));
r.patch('/:id/status', ...assertRole('landlord', 'protectora', 'admin'), validate(adoptionStatusSchema), asyncHandler(ctrl.setStatus));

// Admin
r.get('/', ...assertRole('admin'), asyncHandler(ctrl.listAll));

// Detail by id (adoptante, protectora, admin)
r.get('/:id', ...assertRole('tenant', 'adoptante', 'landlord', 'protectora', 'admin'), asyncHandler(ctrl.getById));

export default r;
