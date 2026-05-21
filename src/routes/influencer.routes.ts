import { Roles } from '../constants/enums';
import { Router } from 'express';
import * as influencerController from '../controllers/influencer.controller';
import { requireAuth } from '../middleware/require-auth';
import { requireRole } from '../middleware/require-role';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/async-handler';
import { upload } from '../middleware/upload';
import {
  influencerProfileSchema,
  missionApplySchema,
  withdrawalCreateSchema
} from '../validators/influencer.validator';

const router = Router();

router.use(requireAuth, requireRole([Roles.INFLUENCER]));

router.get('/profile', asyncHandler(influencerController.getProfile));
router.put('/profile', upload.single('proofImage'), validate(influencerProfileSchema), asyncHandler(influencerController.updateProfile));

router.get('/missions', asyncHandler(influencerController.listMissions));
router.post('/missions/apply', validate(missionApplySchema), asyncHandler(influencerController.applyMission));
router.get('/applications', asyncHandler(influencerController.listApplications));
router.post('/submissions', upload.array('proofImages', 5), asyncHandler(influencerController.submitProof));

router.get('/earnings', asyncHandler(influencerController.getEarnings));
router.post('/withdrawals', validate(withdrawalCreateSchema), asyncHandler(influencerController.requestWithdrawal));
router.get('/withdrawals', asyncHandler(influencerController.listWithdrawals));

router.get('/media-kit', asyncHandler(influencerController.getMediaKit));
router.put('/media-kit', asyncHandler(influencerController.updateMediaKit));

export default router;
