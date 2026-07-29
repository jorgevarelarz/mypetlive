import { Router } from 'express';
import { optionalAuthenticate, authenticate } from '../middleware/auth.middleware';
import asyncHandler from '../utils/asyncHandler';
import { whereToBuy, trackShopClick } from '../controllers/shopping.controller';

const r = Router();

// Dónde comprar un producto (partners con ese item en su catálogo del TPV).
r.get('/where-to-buy', authenticate, asyncHandler(whereToBuy));

// Redirección medida. Auth opcional: el enlace viaja también por correo, donde
// no hay sesión, y perder el usuario no puede costar el clic.
r.get('/click/:partnerId', optionalAuthenticate, asyncHandler(trackShopClick));

export default r;
