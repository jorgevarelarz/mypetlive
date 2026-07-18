import { Router } from 'express';
import { assertRole } from '../middleware/assertRole';
import asyncHandler from '../utils/asyncHandler';
import { getPlan, toggleTask } from '../controllers/welcome.controller';

const r = Router();

// Plan de bienvenida post-adopción del adoptante.
r.get('/:animalId', ...assertRole('tenant', 'adoptante', 'admin'), asyncHandler(getPlan));
r.post('/:animalId/tasks/:key', ...assertRole('tenant', 'adoptante', 'admin'), asyncHandler(toggleTask));

export default r;
