import { Roles } from '../constants/enums';
import { Router } from 'express';
import * as merchantController from '../controllers/merchant.controller';
import { requireAuth } from '../middleware/require-auth';
import { requireRole } from '../middleware/require-role';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/async-handler';
import {
  applicantDecisionSchema,
  createMissionSchema,
  reviewCreateSchema,
  submissionReviewSchema,
  missionStatusSchema,
  merchantProfileSchema,
  topupSchema,
  updateMissionSchema
} from '../validators/merchant.validator';

const router = Router();

router.use(requireAuth, requireRole([Roles.MERCHANT]));

router.get('/profile', asyncHandler(merchantController.getProfile));
router.put('/profile', validate(merchantProfileSchema), asyncHandler(merchantController.updateProfile));

router.get('/wallet', asyncHandler(merchantController.getWallet));
router.get('/wallet/ledger', asyncHandler(merchantController.getWalletLedger));
router.post('/wallet/topup-intent', validate(topupSchema), asyncHandler(merchantController.createWalletTopupIntent));

router.post('/missions', validate(createMissionSchema), asyncHandler(merchantController.createMission));
router.get('/missions', asyncHandler(merchantController.listMissions));
router.get('/missions/:missionId', asyncHandler(merchantController.getMissionDetail));
router.put('/missions/:missionId', validate(updateMissionSchema), asyncHandler(merchantController.updateMission));
router.delete('/missions/:missionId', asyncHandler(merchantController.deleteMission));
router.patch('/missions/:missionId/status', validate(missionStatusSchema), asyncHandler(merchantController.updateMissionStatus));

router.get('/missions/:missionId/applicants', asyncHandler(merchantController.listApplicants));
router.patch('/applications/:applicationId/decision', validate(applicantDecisionSchema), asyncHandler(merchantController.decideApplicant));

router.get('/missions/:missionId/submissions', asyncHandler(merchantController.listSubmissions));
router.patch('/submissions/:submissionId/review', validate(submissionReviewSchema), asyncHandler(merchantController.reviewSubmission));
router.post('/reviews', validate(reviewCreateSchema), asyncHandler(merchantController.createReview));

router.get('/products', asyncHandler(merchantController.listProducts));
router.post('/products', asyncHandler(merchantController.createProduct));
router.get('/products/:productId', asyncHandler(merchantController.getProduct));
router.put('/products/:productId', asyncHandler(merchantController.updateProduct));
router.delete('/products/:productId', asyncHandler(merchantController.deleteProduct));

export default router;
