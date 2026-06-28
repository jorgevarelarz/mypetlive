import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import { assertRole } from '../middleware/assertRole';
import {
  listVets,
  createAppointment,
  listMyAppointments,
  updateAppointmentStatus,
} from '../controllers/vetAppointment.controller';

const router = Router();

// Directorio público de veterinarios.
router.get('/vets', optionalAuthenticate, asyncHandler(listVets));

// Citas veterinarias.
router.post('/vet-appointments', ...assertRole('tenant', 'landlord', 'admin'), asyncHandler(createAppointment));
router.get('/vet-appointments/mine', authenticate, asyncHandler(listMyAppointments));
router.patch('/vet-appointments/:id/status', authenticate, asyncHandler(updateAppointmentStatus));

export default router;
