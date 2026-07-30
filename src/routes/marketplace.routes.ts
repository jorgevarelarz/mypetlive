import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import asyncHandler from '../utils/asyncHandler';
import {
  listProducts,
  getProduct,
  myProducts,
  upsertProduct,
  deleteProduct,
  createCheckout,
  getOrder,
  myOrders,
  sellerOrders,
  markShipped,
} from '../controllers/marketplace.controller';

const r = Router();

// ------------------------------------------------------------------ catálogo
// Público a propósito: un catálogo que exige cuenta no lo encuentra nadie, ni
// Google. La cuenta se pide al pagar, y ni siquiera entonces es obligatoria.
r.get('/products', optionalAuthenticate, asyncHandler(listProducts));

// --------------------------------------------------------- gestión de tienda
// Antes de `/products/:id` porque si no, "mine" entraría como id y devolvería 404.
r.get('/mine', authenticate, authorizeRoles('store', 'admin'), asyncHandler(myProducts));
r.post('/products', authenticate, authorizeRoles('store', 'admin'), asyncHandler(upsertProduct));
r.delete('/products/:id', authenticate, authorizeRoles('store', 'admin'), asyncHandler(deleteProduct));

r.get('/products/:id', optionalAuthenticate, asyncHandler(getProduct));

// ------------------------------------------------------------------ compra
// Auth opcional: se puede comprar sin cuenta. Obligar a registrarse para gastar
// dinero es la forma más rápida de perder un pedido ya decidido.
r.post('/checkout', optionalAuthenticate, asyncHandler(createCheckout));

// ------------------------------------------------------------------ pedidos
r.get('/orders', authenticate, asyncHandler(myOrders));
r.get('/seller/orders', authenticate, authorizeRoles('store', 'admin'), asyncHandler(sellerOrders));
r.post('/orders/:id/ship', authenticate, authorizeRoles('store', 'admin'), asyncHandler(markShipped));

// Al final: `:id` se come cualquier cosa que llegue aquí sin casar antes. El
// invitado entra con su token por query, así que la autenticación es opcional.
r.get('/orders/:id', optionalAuthenticate, asyncHandler(getOrder));

export default r;
