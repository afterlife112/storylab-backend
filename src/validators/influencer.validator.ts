import { WithdrawalStatus } from '@prisma/client';
import { z } from 'zod';

export const influencerProfileSchema = z.object({
  igLink: z.string().url(),
  tiktokLink: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional().nullable()
  ),
  followerCount: z.coerce.number().int().nonnegative(),
  phone: z.string().min(6)
});

export const otpRequestSchema = z.object({
  phone: z.string().min(6)
});

export const otpVerifySchema = z.object({
  phone: z.string().min(6),
  code: z.string().length(6)
});

export const missionApplySchema = z.object({
  missionId: z.string().cuid()
});

export const missionSubmissionSchema = z.object({
  applicationId: z.string().cuid(),
  links: z.array(z.string().url()).min(1),
  caption: z.string().min(3)
});

export const withdrawalCreateSchema = z.object({
  points: z.number().int().positive()
});

export const disputeCreateSchema = z.object({
  applicationId: z.string().cuid(),
  reason: z.string().min(3),
  details: z.string().min(5)
});

export const withdrawalStatusSchema = z.object({
  status: z.nativeEnum(WithdrawalStatus),
  payoutRef: z.string().optional(),
  adminNotes: z.string().optional()
});
