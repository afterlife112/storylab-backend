import { Role } from '@prisma/client';
import { Router } from 'express';
import * as influencerController from '../controllers/influencer.controller';
import { requireAuth } from '../middleware/require-auth';
import { requireRole } from '../middleware/require-role';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/async-handler';
import { upload } from '../middleware/upload';
import {
  disputeCreateSchema,
  influencerProfileSchema,
  missionApplySchema,
  otpRequestSchema,
  otpVerifySchema,
  withdrawalCreateSchema
} from '../validators/influencer.validator';
import { messageSchema } from '../validators/common.validator';

const router = Router();

router.use(requireAuth, requireRole([Role.INFLUENCER]));

router.get('/profile', asyncHandler(influencerController.getProfile));
router.put('/profile', upload.single('proofImage'), validate(influencerProfileSchema), asyncHandler(influencerController.updateProfile));
router.post('/otp/request', validate(otpRequestSchema), asyncHandler(influencerController.requestOtp));
router.post('/otp/verify', validate(otpVerifySchema), asyncHandler(influencerController.verifyOtp));

router.get('/missions', asyncHandler(influencerController.listMissions));
router.post('/missions/apply', validate(missionApplySchema), asyncHandler(influencerController.applyMission));
router.get('/applications', asyncHandler(influencerController.listApplications));
router.get('/applications/:applicationId/merchant-landing', asyncHandler(influencerController.getMerchantLandingLink));
router.post('/applications/:applicationId/merchant-landing/qr', asyncHandler(influencerController.generateMerchantLandingQr));
router.post('/submissions', upload.array('proofImages', 5), asyncHandler(influencerController.submitProof));
router.get('/customer/check-ins', asyncHandler(influencerController.listCustomerCheckIns));

router.get('/earnings', asyncHandler(influencerController.getEarnings));
router.post('/withdrawals', validate(withdrawalCreateSchema), asyncHandler(influencerController.requestWithdrawal));
router.get('/withdrawals', asyncHandler(influencerController.listWithdrawals));

router.get('/notifications', asyncHandler(influencerController.listNotifications));
router.post('/disputes', validate(disputeCreateSchema), asyncHandler(influencerController.openDispute));

router.get('/chats', asyncHandler(influencerController.listChats));
router.get('/chats/:applicationId/messages', asyncHandler(influencerController.getChatMessages));
router.post('/chats/:applicationId/messages', validate(messageSchema), asyncHandler(influencerController.sendChatMessage));

router.get('/commerce', asyncHandler(influencerController.getCommerceState));
router.post('/commerce/addresses', asyncHandler(influencerController.createCommerceAddress));
router.patch('/commerce/addresses/:addressId/default', asyncHandler(influencerController.setDefaultCommerceAddress));
router.post('/commerce/orders', asyncHandler(influencerController.createCommerceOrder));
router.patch('/commerce/preferences', asyncHandler(influencerController.updateCommercePreferences));

router.get('/media-kit', asyncHandler(influencerController.getMediaKit));
router.put('/media-kit', asyncHandler(influencerController.updateMediaKit));

export default router;
