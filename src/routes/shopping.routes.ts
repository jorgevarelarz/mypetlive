import { Router } from 'express';
import { optionalAuthenticate, authenticate } from '../middleware/auth.middleware';
import asyncHandler from '../utils/asyncHandler';
import { whereToBuy, trackShopClick, trackProductClick } from '../controllers/shopping.controller';

const r = Router();

// Dónde comprar un producto: catálogo del marketplace (comprable) y catálogo del
// TPV de los partners (informativo).
r.get('/where-to-buy', authenticate, asyncHandler(whereToBuy));

// Redirección medida. Auth opcional: el enlace viaja también por correo, donde
// no hay sesión, y perder el usuario no puede costar el clic.
//
// La ruta de producto va primero por claridad; no colisiona con la de partner,
// que tiene un segmento menos.
r.get('/click/product/:productId', optionalAuthenticate, asyncHandler(trackProductClick));
r.get('/click/:partnerId', optionalAuthenticate, asyncHandler(trackShopClick));

export default r;
