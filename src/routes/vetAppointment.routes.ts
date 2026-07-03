import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import { assertRole } from '../middleware/assertRole';
import {
  listVets,
  createAppointment,
  listMyAppointments,
  updateAppointmentStatus,
  getCalendarFeed,
  rotateCalendarFeed,
  calendarFeedIcs,
} from '../controllers/vetAppointment.controller';

const router = Router();

// Directorio público de veterinarios.
router.get('/vets', optionalAuthenticate, asyncHandler(listVets));

// Feed iCal de la agenda del vet (suscripción desde Google/Apple/Outlook).
router.get('/vets/me/calendar-feed', ...assertRole('vet'), asyncHandler(getCalendarFeed));
router.post('/vets/me/calendar-feed/rotate', ...assertRole('vet'), asyncHandler(rotateCalendarFeed));
router.get('/vets/calendar/:token.ics', asyncHandler(calendarFeedIcs));

// Citas veterinarias.
router.post('/vet-appointments', ...assertRole('tenant', 'landlord', 'admin'), asyncHandler(createAppointment));
router.get('/vet-appointments/mine', authenticate, asyncHandler(listMyAppointments));
router.patch('/vet-appointments/:id/status', authenticate, asyncHandler(updateAppointmentStatus));

export default router;
