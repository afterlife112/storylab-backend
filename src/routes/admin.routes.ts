import { Role } from '@prisma/client';
import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { requireAuth } from '../middleware/require-auth';
import { requireRole } from '../middleware/require-role';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/async-handler';
import {
  categoryReorderSchema,
  categorySchema,
  disputeResolveSchema,
  financeSettingsSchema,
  missionSuspendSchema,
  userBanSchema,
  verificationDecisionSchema
} from '../validators/admin.validator';
import { withdrawalStatusSchema } from '../validators/influencer.validator';

const router = Router();

router.use(requireAuth, requireRole([Role.ADMIN]));

router.get('/dashboard', asyncHandler(adminController.dashboard));

router.get('/categories', asyncHandler(adminController.listCategories));
router.post('/categories', validate(categorySchema), asyncHandler(adminController.createCategory));
router.put('/categories/:id', validate(categorySchema), asyncHandler(adminController.updateCategory));
router.delete('/categories/:id', asyncHandler(adminController.deleteCategory));
router.patch('/categories/reorder', validate(categoryReorderSchema), asyncHandler(adminController.reorderCategories));

router.get('/verifications', asyncHandler(adminController.listVerifications));
router.patch('/verifications/:influencerId', validate(verificationDecisionSchema), asyncHandler(adminController.decideVerification));

router.patch('/missions/:missionId/moderate', validate(missionSuspendSchema), asyncHandler(adminController.moderateMission));

router.get('/users', asyncHandler(adminController.listUsers));
router.patch('/users/:userId/status', validate(userBanSchema), asyncHandler(adminController.updateUserStatus));

router.get('/finance/settings', asyncHandler(adminController.getFinanceSettings));
router.patch('/finance/settings', validate(financeSettingsSchema), asyncHandler(adminController.updateFinanceSettings));

router.get('/withdrawals', asyncHandler(adminController.listWithdrawals));
router.patch('/withdrawals/:withdrawalId', validate(withdrawalStatusSchema), asyncHandler(adminController.updateWithdrawal));

router.get('/audit-logs', asyncHandler(adminController.listAuditLogs));

router.get('/disputes', asyncHandler(adminController.listDisputes));
router.patch('/disputes/:disputeId', validate(disputeResolveSchema), asyncHandler(adminController.resolveDispute));

export default router;