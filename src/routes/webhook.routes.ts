import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

router.post('/revenue-monster', asyncHandler(paymentController.revenueMonsterWebhook));

export default router;