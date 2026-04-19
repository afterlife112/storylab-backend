import { MissionApplicationStatus, MissionSubmissionStatus, MissionStatus, NotificationType, Prisma, PricingMode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/app-error';
import { getFinanceSettings } from './settings.service';
import { createNotification } from './notification.service';
import { toMeta } from '../utils/pagination';
import { disableMerchantLandingForApplication, ensureMerchantLandingForAcceptedApplication } from './merchant-landing.service';
import {
  createMerchantProduct as createMerchantProductRecord,
  deleteMerchantProduct as deleteMerchantProductRecord,
  getMerchantProduct as getMerchantProductRecord,
  getMerchantVoucherByCode as getMerchantVoucherByCodeRecord,
  listMerchantProducts as listMerchantProductsRecord,
  redeemMerchantVoucher as redeemMerchantVoucherRecord,
  updateMerchantProduct as updateMerchantProductRecord
} from './commerce.service';

const getMerchantProfileOrThrow = async (userId: string) => {
  const profile = await prisma.merchantProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError('Merchant profile not found', 404);
  }
  return profile;
};

const getMissionBudget = (mission: { pricingMode: PricingMode; commissionPoolAmount: Prisma.Decimal | null; fixedBudgetAmount: Prisma.Decimal | null }) => {
  if (mission.pricingMode === 'COMMISSION_POOL') {
    return Number(mission.commissionPoolAmount ?? 0);
  }
  return Number(mission.fixedBudgetAmount ?? 0);
};

export const getMerchantProfile = async (userId: string) => {
  const profile = await getMerchantProfileOrThrow(userId);
  return profile;
};

export const updateMerchantProfile = async (
  userId: string,
  payload: {
    companyName: string;
    contactPerson: string;
    phone: string;
    email: string;
    address: string;
    logoUrl?: string | null;
    socials?: Record<string, string | number | boolean | null>;
  }
) => {
  const profile = await getMerchantProfileOrThrow(userId);
  return prisma.merchantProfile.update({
    where: { id: profile.id },
    data: {
      ...payload,
      logoUrl: payload.logoUrl ?? null,
      socials: (payload.socials ?? null) as any
    }
  });
};

export const getMerchantWallet = async (userId: string) => {
  const profile = await getMerchantProfileOrThrow(userId);
  const wallet = await prisma.merchantWalletAccount.findUnique({ where: { merchantId: profile.id } });
  if (!wallet) {
    throw new AppError('Wallet account not found', 404);
  }
  return wallet;
};

export const getMerchantWalletLedger = async (userId: string, page: number, pageSize: number) => {
  const wallet = await getMerchantWallet(userId);
  const where = { walletAccountId: wallet.id };
  const [items, total] = await Promise.all([
    prisma.merchantWalletLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.merchantWalletLedger.count({ where })
  ]);

  return {
    items,
    meta: toMeta(page, pageSize, total)
  };
};

export const createMission = async (
  userId: string,
  payload: {
    categoryId: string;
    title: string;
    description: string;
    platformRequirements: string[];
    deliverablesChecklist: string[];
    location?: string | null;
    deadline: string;
    quota: number;
    pricingMode: PricingMode;
    commissionPoolAmount?: number;
    fixedBudgetAmount?: number;
  }
) => {
  const merchantProfile = await getMerchantProfileOrThrow(userId);
  const financeSettings = await getFinanceSettings();

  const category = await prisma.category.findUnique({ where: { id: payload.categoryId } });
  if (!category || !category.isEnabled) {
    throw new AppError('Invalid category', 422);
  }

  const budget = payload.pricingMode === 'COMMISSION_POOL' ? payload.commissionPoolAmount : payload.fixedBudgetAmount;
  if (!budget || budget <= 0) {
    throw new AppError('Budget is required for selected pricing mode', 422);
  }

  const platformFeeAmount = Number(((budget * financeSettings.platformFeePercent) / 100).toFixed(2));
  const totalChargeAmount = Number((budget + platformFeeAmount).toFixed(2));

  return prisma.mission.create({
    data: {
      merchantProfileId: merchantProfile.id,
      categoryId: payload.categoryId,
      title: payload.title,
      description: payload.description,
      platformRequirements: payload.platformRequirements as any,
      deliverablesChecklist: payload.deliverablesChecklist as any,
      location: payload.location,
      deadline: new Date(payload.deadline),
      quota: payload.quota,
      pricingMode: payload.pricingMode,
      commissionPoolAmount: payload.pricingMode === 'COMMISSION_POOL' ? budget : null,
      fixedBudgetAmount: payload.pricingMode === 'FIXED_BUDGET' ? budget : null,
      platformFeeAmount,
      totalChargeAmount,
      status: MissionStatus.DRAFT
    }
  });
};

export const updateMission = async (
  userId: string,
  missionId: string,
  payload: {
    categoryId: string;
    title: string;
    description: string;
    platformRequirements: string[];
    deliverablesChecklist: string[];
    location?: string | null;
    deadline: string;
    quota: number;
    pricingMode: PricingMode;
    commissionPoolAmount?: number;
    fixedBudgetAmount?: number;
  }
) => {
  const merchantProfile = await getMerchantProfileOrThrow(userId);
  const mission = await prisma.mission.findFirst({ where: { id: missionId, merchantProfileId: merchantProfile.id } });
  if (!mission) throw new AppError('Mission not found', 404);
  if (mission.status !== MissionStatus.DRAFT) throw new AppError('Only draft missions can be edited', 422);

  const category = await prisma.category.findUnique({ where: { id: payload.categoryId } });
  if (!category || !category.isEnabled) {
    throw new AppError('Invalid category', 422);
  }

  const budget = payload.pricingMode === 'COMMISSION_POOL' ? payload.commissionPoolAmount : payload.fixedBudgetAmount;
  if (!budget || budget <= 0) {
    throw new AppError('Budget is required for selected pricing mode', 422);
  }

  const financeSettings = await getFinanceSettings();
  const platformFeeAmount = Number(((budget * financeSettings.platformFeePercent) / 100).toFixed(2));
  const totalChargeAmount = Number((budget + platformFeeAmount).toFixed(2));

  return prisma.mission.update({
    where: { id: mission.id },
    data: {
      categoryId: payload.categoryId,
      title: payload.title,
      description: payload.description,
      platformRequirements: payload.platformRequirements as any,
      deliverablesChecklist: payload.deliverablesChecklist as any,
      location: payload.location,
      deadline: new Date(payload.deadline),
      quota: payload.quota,
      pricingMode: payload.pricingMode,
      commissionPoolAmount: payload.pricingMode === 'COMMISSION_POOL' ? budget : null,
      fixedBudgetAmount: payload.pricingMode === 'FIXED_BUDGET' ? budget : null,
      platformFeeAmount,
      totalChargeAmount
    }
  });
};

export const deleteMission = async (userId: string, missionId: string) => {
  const merchantProfile = await getMerchantProfileOrThrow(userId);
  const mission = await prisma.mission.findFirst({ where: { id: missionId, merchantProfileId: merchantProfile.id } });
  if (!mission) throw new AppError('Mission not found', 404);
  if (mission.status !== MissionStatus.DRAFT) throw new AppError('Only draft missions can be deleted', 422);

  await prisma.mission.delete({ where: { id: mission.id } });
  return { deleted: true as const, id: mission.id };
};

export const updateMissionStatus = async (userId: string, missionId: string, status: MissionStatus, reason?: string) => {
  const merchantProfile = await getMerchantProfileOrThrow(userId);
  const mission = await prisma.mission.findFirst({ where: { id: missionId, merchantProfileId: merchantProfile.id } });
  if (!mission) throw new AppError('Mission not found', 404);

  if (status === 'PUBLISHED') {
    if (mission.status !== 'DRAFT') {
      throw new AppError('Only draft missions can be published', 422);
    }

    const wallet = await prisma.merchantWalletAccount.findUnique({ where: { merchantId: merchantProfile.id } });
    if (!wallet) throw new AppError('Wallet not found', 404);
    if (Number(wallet.balance) < Number(mission.totalChargeAmount)) {
      throw new AppError('Insufficient wallet balance for mission publishing', 422);
    }

    await prisma.$transaction(async (tx) => {
      await tx.merchantWalletAccount.update({
        where: { id: wallet.id },
        data: {
          balance: {
            decrement: mission.totalChargeAmount
          }
        }
      });

      await tx.merchantWalletLedger.create({
        data: {
          walletAccountId: wallet.id,
          amount: mission.totalChargeAmount,
          direction: 'DEBIT',
          type: 'CHARGE',
          reference: `MISSION-${mission.id}`,
          notes: `Mission publish charge for ${mission.title}`
        }
      });

      await tx.mission.update({
        where: { id: mission.id },
        data: { status: 'PUBLISHED' }
      });
    });

    return prisma.mission.findUniqueOrThrow({ where: { id: mission.id } });
  }

  return prisma.mission.update({
    where: { id: mission.id },
    data: {
      status,
      suspendedReason: status === 'SUSPENDED' ? reason ?? 'Suspended by merchant' : null
    }
  });
};

export const listMerchantMissions = async (userId: string, page: number, pageSize: number, status?: MissionStatus) => {
  const merchantProfile = await getMerchantProfileOrThrow(userId);
  const where = {
    merchantProfileId: merchantProfile.id,
    ...(status ? { status } : {})
  };

  const [items, total] = await Promise.all([
    prisma.mission.findMany({
      where,
      include: { category: true, _count: { select: { applications: true, submissions: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.mission.count({ where })
  ]);

  return {
    items,
    meta: toMeta(page, pageSize, total)
  };
};

export const getMissionDetail = async (userId: string, missionId: string) => {
  const merchantProfile = await getMerchantProfileOrThrow(userId);
  const mission = await prisma.mission.findFirst({
    where: { id: missionId, merchantProfileId: merchantProfile.id },
    include: {
      category: true,
      applications: {
        include: {
          influencer: {
            include: {
              user: { select: { email: true, id: true } }
            }
          },
          submission: true
        },
        orderBy: { createdAt: 'desc' }
      },
      submissions: {
        include: {
          influencer: {
            include: {
              user: { select: { email: true, id: true } }
            }
          },
          application: true,
          review: true
        },
        orderBy: { createdAt: 'desc' }
      },
      chats: {
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              sender: { select: { email: true, role: true } }
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      }
    }
  });
  if (!mission) throw new AppError('Mission not found', 404);
  return mission;
};

export const listMissionApplicants = async (userId: string, missionId: string) => {
  const merchantProfile = await getMerchantProfileOrThrow(userId);
  const mission = await prisma.mission.findFirst({ where: { id: missionId, merchantProfileId: merchantProfile.id } });
  if (!mission) throw new AppError('Mission not found', 404);

  return prisma.missionApplication.findMany({
    where: { missionId },
    include: {
      influencer: {
        include: {
          user: {
            select: { email: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
};

export const decideMissionApplication = async (
  userId: string,
  applicationId: string,
  status: Extract<MissionApplicationStatus, 'ACCEPTED' | 'REJECTED'>
) => {
  const merchantProfile = await getMerchantProfileOrThrow(userId);
  const application = await prisma.missionApplication.findUnique({
    where: { id: applicationId },
    include: {
      mission: true,
      influencer: {
        include: {
          user: true
        }
      }
    }
  });

  if (!application || application.mission.merchantProfileId !== merchantProfile.id) {
    throw new AppError('Application not found', 404);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.missionApplication.update({
      where: { id: applicationId },
      data: { status }
    });

    if (status === 'ACCEPTED') {
      await tx.chat.upsert({
        where: { applicationId: application.id },
        update: {},
        create: {
          applicationId: application.id,
          missionId: application.missionId,
          merchantId: merchantProfile.id,
          influencerId: application.influencerId
        }
      });

      if (application.mission.status === 'PUBLISHED') {
        await tx.mission.update({ where: { id: application.missionId }, data: { status: 'IN_PROGRESS' } });
      }
    }

    return next;
  });

  if (status === 'ACCEPTED') {
    await ensureMerchantLandingForAcceptedApplication(application.id);
  }

  if (status === 'REJECTED') {
    await disableMerchantLandingForApplication(application.id);
  }

  await createNotification({
    userId: application.influencer.userId,
    type: NotificationType.APPLICATION,
    title: 'Mission application updated',
    message: `Your application for ${application.mission.title} is ${status.toLowerCase()}`,
    metadata: { missionId: application.missionId, applicationId }
  });

  return updated;
};

export const listMissionSubmissions = async (userId: string, missionId: string) => {
  const merchantProfile = await getMerchantProfileOrThrow(userId);
  const mission = await prisma.mission.findFirst({ where: { id: missionId, merchantProfileId: merchantProfile.id } });
  if (!mission) throw new AppError('Mission not found', 404);

  return prisma.missionSubmission.findMany({
    where: { missionId },
    include: {
      influencer: {
        include: {
          user: {
            select: { email: true }
          }
        }
      },
      application: true
    },
    orderBy: { createdAt: 'desc' }
  });
};

export const reviewSubmission = async (
  userId: string,
  submissionId: string,
  status: Extract<MissionSubmissionStatus, 'APPROVED' | 'REJECTED' | 'RESUBMIT_REQUIRED'>,
  reviewNote: string
) => {
  const merchantProfile = await getMerchantProfileOrThrow(userId);
  const submission = await prisma.missionSubmission.findUnique({
    where: { id: submissionId },
    include: {
      mission: true,
      influencer: { include: { user: true, pointsAccount: true } },
      application: true
    }
  });

  if (!submission || submission.mission.merchantProfileId !== merchantProfile.id) {
    throw new AppError('Submission not found', 404);
  }

  if (submission.application.status !== 'ACCEPTED') {
    throw new AppError('Submission application is not accepted', 422);
  }

  const settings = status === 'APPROVED' ? await getFinanceSettings() : null;

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.missionSubmission.update({
      where: { id: submissionId },
      data: { status, reviewNote }
    });

    if (status === 'APPROVED') {
      if (submission.status === 'APPROVED') {
        throw new AppError('Submission already approved', 422);
      }

      const missionBudget = getMissionBudget(submission.mission);
      const payoutPerInfluencer = missionBudget / submission.mission.quota;
      const points = Math.max(1, Math.round(payoutPerInfluencer / (settings?.pointsToMyrRate ?? 0.01)));

      const pointsAccount = submission.influencer.pointsAccount;
      if (!pointsAccount) {
        throw new AppError('Points account not found', 404);
      }

      await tx.pointsAccount.update({
        where: { id: pointsAccount.id },
        data: {
          balancePoints: { increment: points }
        }
      });

      await tx.pointsLedger.create({
        data: {
          pointsAccountId: pointsAccount.id,
          points,
          type: 'MISSION_EARNING',
          reference: `SUBMISSION-${submission.id}`,
          notes: `Mission reward for ${submission.mission.title}`
        }
      });

      const approvedCount = await tx.missionSubmission.count({
        where: {
          missionId: submission.missionId,
          status: 'APPROVED'
        }
      });

      if (approvedCount >= submission.mission.quota) {
        await tx.mission.update({ where: { id: submission.missionId }, data: { status: 'COMPLETED' } });
      }
    }

    return next;
  });

  await createNotification({
    userId: submission.influencer.userId,
    type: NotificationType.SUBMISSION,
    title: 'Mission submission reviewed',
    message: `Your submission is ${status.toLowerCase()}`,
    metadata: {
      missionId: submission.missionId,
      submissionId,
      reviewNote
    }
  });

  return updated;
};

export const createMissionReview = async (
  userId: string,
  payload: {
    missionId: string;
    submissionId: string;
    influencerId: string;
    star: number;
    comment: string;
  }
) => {
  const merchantProfile = await getMerchantProfileOrThrow(userId);
  const mission = await prisma.mission.findFirst({ where: { id: payload.missionId, merchantProfileId: merchantProfile.id } });
  if (!mission) throw new AppError('Mission not found', 404);

  const submission = await prisma.missionSubmission.findUnique({
    where: { id: payload.submissionId },
    include: { influencer: true }
  });

  if (!submission || submission.missionId !== payload.missionId || submission.status !== 'APPROVED') {
    throw new AppError('Submission must be approved before review', 422);
  }

  return prisma.review.create({
    data: {
      missionId: payload.missionId,
      submissionId: payload.submissionId,
      merchantId: merchantProfile.id,
      influencerId: payload.influencerId,
      star: payload.star,
      comment: payload.comment
    }
  });
};

export const listMerchantNotifications = async (userId: string, page: number, pageSize: number) => {
  const where = { userId };
  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.notification.count({ where })
  ]);

  return { items, meta: toMeta(page, pageSize, total) };
};

export const openMerchantDispute = async (
  userId: string,
  payload: { applicationId: string; reason: string; details: string }
) => {
  const merchantProfile = await getMerchantProfileOrThrow(userId);
  const application = await prisma.missionApplication.findUnique({
    where: { id: payload.applicationId },
    include: { mission: true }
  });

  if (!application || application.mission.merchantProfileId !== merchantProfile.id) {
    throw new AppError('Application not found', 404);
  }

  return prisma.dispute.create({
    data: {
      missionId: application.missionId,
      applicationId: application.id,
      openedById: userId,
      reason: payload.reason,
      details: payload.details
    }
  });
};

export const listMerchantProducts = async (userId: string) => listMerchantProductsRecord(userId);

export const getMerchantProduct = async (userId: string, productId: string) => getMerchantProductRecord(userId, productId);

export const createMerchantProduct = async (
  userId: string,
  payload: {
    name: string;
    sku: string;
    category: string;
    price: number;
    stock: number;
    status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
    description: string;
    imageUrl?: string | null;
  }
) => createMerchantProductRecord(userId, payload);

export const updateMerchantProduct = async (
  userId: string,
  productId: string,
  payload: {
    name: string;
    sku: string;
    category: string;
    price: number;
    stock: number;
    status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
    description: string;
    imageUrl?: string | null;
  }
) => updateMerchantProductRecord(userId, productId, payload);

export const deleteMerchantProduct = async (userId: string, productId: string) => deleteMerchantProductRecord(userId, productId);

export const getMerchantVoucherByCode = async (userId: string, code: string) => getMerchantVoucherByCodeRecord(userId, code);

export const redeemMerchantVoucher = async (userId: string, code: string) => redeemMerchantVoucherRecord(userId, code);
