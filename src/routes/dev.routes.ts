import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import * as paymentController from '../controllers/payment.controller';

const router = Router();

router.get('/mock-pay/:referenceId', asyncHandler(paymentController.mockPay));

export default router;