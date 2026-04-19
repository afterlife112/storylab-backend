import { Router } from 'express';
import * as publicController from '../controllers/public.controller';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

router.get('/categories', asyncHandler(publicController.categories));
router.get('/missions', asyncHandler(publicController.missions));
router.get('/missions/:missionId', asyncHandler(publicController.missionById));
router.get('/merchant-landings/:slug', asyncHandler(publicController.merchantLandingBySlug));
router.get('/merchant-landings/:slug/products', asyncHandler(publicController.merchantLandingProducts));
router.post('/merchant-landings/:slug/checkout', asyncHandler(publicController.merchantLandingCheckout));
router.post('/merchant-landings/check-in/:token', asyncHandler(publicController.consumeMerchantCheckIn));
router.get('/config', asyncHandler(publicController.config));
router.get('/shop/categories', asyncHandler(publicController.shopCategories));
router.get('/shop/products', asyncHandler(publicController.shopProducts));
router.get('/shop/products/:slug', asyncHandler(publicController.shopProductBySlug));

export default router;
