import { Router } from 'express';
import { getAllUsers, updateUser } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();

// List all users (solo admin: expone email/perfil de todos los usuarios).
router.get('/', authenticate, requireAdmin, getAllUsers);

// Update a user by id (requires authentication)
router.patch('/:id', authenticate, updateUser);

export default router;