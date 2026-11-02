import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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
  vetAvailability,
} from '../controllers/vetAppointment.controller';

const router = Router();

// Directorio público de veterinarios.
router.get('/vets', optionalAuthenticate, asyncHandler(listVets));
// Huecos libres de un veterinario para reservar (calendario de «Citas»).
router.get('/vets/:id/availability', optionalAuthenticate, asyncHandler(vetAvailability));

// Feed iCal de la agenda del vet (suscripción desde Google/Apple/Outlook).
router.get('/vets/me/calendar-feed', ...assertRole('vet'), asyncHandler(getCalendarFeed));
router.post('/vets/me/calendar-feed/rotate', ...assertRole('vet'), asyncHandler(rotateCalendarFeed));
router.get('/vets/calendar/:token.ics', asyncHandler(calendarFeedIcs));

// Citas veterinarias.
// Límite por persona (AUD-2, FAC-124): además del tope de citas pendientes del controlador.
const citasLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.VET_APPT_HOURLY_LIMIT || 20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => String(req.user?._id || req.user?.id || req.ip),
});
router.post('/vet-appointments', ...assertRole('tenant', 'landlord', 'admin'), citasLimiter, asyncHandler(createAppointment));
router.get('/vet-appointments/mine', authenticate, asyncHandler(listMyAppointments));
router.patch('/vet-appointments/:id/status', authenticate, asyncHandler(updateAppointmentStatus));

export default router;
