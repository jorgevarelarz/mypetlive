import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  listAvailableCoupons,
  useCoupon,
  listMyCoupons,
  createMyCoupon,
  updateMyCoupon,
} from '../controllers/coupon.controller';
import { assertRole } from '../middleware/assertRole';

const router = Router();

router.get('/coupons', asyncHandler(listCoupons));
router.get('/coupons/available', ...assertRole('store', 'vet', 'admin'), asyncHandler(listAvailableCoupons));
// Autoservicio del partner. Va ANTES de '/coupons/:id' o ':id' se comería "mine".
// El admin no pasa por aquí: tiene su CRUD completo en /api/admin/coupons.
router.get('/coupons/mine', ...assertRole('store', 'vet'), asyncHandler(listMyCoupons));
router.post('/coupons/mine', ...assertRole('store', 'vet'), asyncHandler(createMyCoupon));
router.patch('/coupons/mine/:id', ...assertRole('store', 'vet'), asyncHandler(updateMyCoupon));

router.post('/coupons', ...assertRole('admin'), asyncHandler(createCoupon));
router.patch('/coupons/:id', ...assertRole('admin'), asyncHandler(updateCoupon));
router.post('/coupons/:id/use', ...assertRole('store', 'vet', 'admin'), asyncHandler(useCoupon));

export default router;
