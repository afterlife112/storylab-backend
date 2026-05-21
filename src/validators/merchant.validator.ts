import { MissionStatuses, PricingModes } from '../constants/enums';
import { z } from 'zod';

export const merchantProfileSchema = z.object({
  companyName: z.string().min(2),
  contactPerson: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email(),
  address: z.string().min(4),
  logoUrl: z.string().url().optional().nullable(),
  socials: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

export const createMissionSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().min(10),
  platformRequirements: z.array(z.enum(['IG', 'TikTok', 'FB'])).min(1),
  deliverablesChecklist: z.array(z.string().min(1)).min(1),
  location: z.string().optional().nullable(),
  deadline: z.string().datetime(),
  quota: z.number().int().positive(),
  pricingMode: z.enum([PricingModes.FIXED_BUDGET, PricingModes.COMMISSION_POOL]),
  commissionPoolAmount: z.number().positive().optional(),
  fixedBudgetAmount: z.number().positive().optional(),
  aiKocEnabled: z.boolean().optional()
});

export const updateMissionSchema = createMissionSchema;

export const missionStatusSchema = z.object({
  status: z.enum([
    MissionStatuses.DRAFT,
    MissionStatuses.PUBLISHED,
    MissionStatuses.PAUSED,
    MissionStatuses.COMPLETED,
    MissionStatuses.CANCELLED
  ]),
  reason: z.string().optional()
});

export const topupSchema = z.object({
  amount: z.number().positive()
});

export const applicantDecisionSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED'])
});

export const submissionReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'RESUBMIT_REQUIRED']),
  reviewNote: z.string().min(3)
});

export const reviewCreateSchema = z.object({
  missionId: z.string().uuid(),
  submissionId: z.string().uuid(),
  influencerId: z.string().uuid(),
  star: z.number().int().min(1).max(5),
  comment: z.string().min(2)
});
