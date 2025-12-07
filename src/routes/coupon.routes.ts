import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  listAvailableCoupons,
  useCoupon,
} from '../controllers/coupon.controller';
import { assertRole } from '../middleware/assertRole';

const router = Router();

router.get('/coupons', asyncHandler(listCoupons));
router.get('/coupons/available', ...assertRole('store', 'vet', 'admin'), asyncHandler(listAvailableCoupons));
router.post('/coupons', ...assertRole('admin'), asyncHandler(createCoupon));
router.patch('/coupons/:id', ...assertRole('admin'), asyncHandler(updateCoupon));
router.post('/coupons/:id/use', ...assertRole('store', 'vet', 'admin'), asyncHandler(useCoupon));

export default router;
