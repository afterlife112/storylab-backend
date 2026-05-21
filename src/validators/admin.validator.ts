import { VerificationStatuses } from '../constants/enums';
import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().nonnegative().default(0),
  isEnabled: z.boolean().default(true)
});

export const categoryReorderSchema = z.object({
  order: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().nonnegative() })).min(1)
});

export const verificationDecisionSchema = z.object({
  status: z.enum([
    VerificationStatuses.UNVERIFIED,
    VerificationStatuses.PENDING,
    VerificationStatuses.VERIFIED,
    VerificationStatuses.REJECTED
  ]),
  notes: z.string().min(2)
});

export const userBanSchema = z.object({
  status: z.enum(['ACTIVE', 'BANNED'])
});

export const financeSettingsSchema = z.object({
  platformFeePercent: z.number().nonnegative(),
  pointsToMyrRate: z.number().positive(),
  minWithdrawalMyr: z.number().positive()
});

export const missionSuspendSchema = z.object({
  suspended: z.boolean(),
  reason: z.string().optional()
});

export const disputeResolveSchema = z.object({
  status: z.enum(['RESOLVED', 'REJECTED']),
  resolutionNote: z.string().min(3)
});
