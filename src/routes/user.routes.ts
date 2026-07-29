import { Router } from 'express';
import { getAllUsers, updateUser, confirmEmailChange } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();

// List all users (solo admin: expone email/perfil de todos los usuarios).
router.get('/', authenticate, requireAdmin, getAllUsers);

// Confirmar un cambio de email pendiente. Sin `authenticate` a propósito: el
// enlace se abre desde el buzón nuevo, donde puede no haber sesión, y el token
// ya demuestra que quien pulsa controla esa dirección. Va antes que `/:id` para
// que 'email' no se lea como un id.
router.post('/email/confirm', confirmEmailChange);

// Update a user by id (requires authentication)
router.patch('/:id', authenticate, updateUser);

export default router;