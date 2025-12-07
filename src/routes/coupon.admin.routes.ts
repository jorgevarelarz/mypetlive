import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler';
import {
  listAdminCoupons,
  createAdminCoupon,
  updateAdminCoupon,
  toggleAdminCoupon,
  listCouponPartners,
} from '../controllers/coupon.admin.controller';

const router = Router();

router.get('/', asyncHandler(listAdminCoupons));
router.get('/partners', asyncHandler(listCouponPartners));
router.post('/', asyncHandler(createAdminCoupon));
router.patch('/:id', asyncHandler(updateAdminCoupon));
router.patch('/:id/toggle', asyncHandler(toggleAdminCoupon));

export default router;
