import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/app-error';
import { toMeta } from '../utils/pagination';
import { getFinanceSettings } from './settings.service';
import { createNotification } from './notification.service';
import {
  createCommerceAddress,
  createInfluencerCommerceOrder,
  getInfluencerCommerceState,
  getInfluencerMediaKit,
  setDefaultCommerceAddress,
  updateCommercePreferences,
  updateInfluencerMediaKit
} from './commerce.service';

const getInfluencerProfileOrThrow = async (userId: string) => {
  const profile = await prisma.influencerProfile.findUnique({
    where: { userId },
    include: { pointsAccount: true, user: true }
  });
  if (!profile) {
    throw new AppError('Influencer profile not found', 404);
  }
  return profile;
};

export const getInfluencerProfile = async (userId: string) => getInfluencerProfileOrThrow(userId);

export const updateInfluencerProfile = async (
  userId: string,
  payload: {
    igLink: string;
    tiktokLink?: string | null;
    followerCount: number;
    phone: string;
    proofImageUrl?: string;
  }
) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  const proofImage = payload.proofImageUrl ?? profile.proofImageUrl;
  if (!proofImage) {
    throw new AppError('Follower proof image is required', 422);
  }

  return prisma.influencerProfile.update({
    where: { id: profile.id },
    data: {
      igLink: payload.igLink,
      tiktokLink: payload.tiktokLink,
      followerCount: payload.followerCount,
      phone: payload.phone,
      proofImageUrl: proofImage,
      verificationStatus: 'PENDING'
    }
  });
};

export const requestPhoneOtp = async (phone: string) => {
  const code = '123456';
  await prisma.phoneOtp.create({
    data: {
      phone,
      code,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    }
  });

  return { code, expiresInSeconds: 300 };
};

export const verifyPhoneOtp = async (userId: string, phone: string, code: string) => {
  const otp = await prisma.phoneOtp.findFirst({
    where: {
      phone,
      code,
      isUsed: false,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!otp) {
    throw new AppError('Invalid OTP', 422);
  }

  const profile = await getInfluencerProfileOrThrow(userId);

  await prisma.$transaction([
    prisma.phoneOtp.update({ where: { id: otp.id }, data: { isUsed: true } }),
    prisma.influencerProfile.update({
      where: { id: profile.id },
      data: {
        phone,
        phoneVerifiedAt: new Date()
      }
    })
  ]);

  return { verified: true };
};

export const listDiscoverMissions = async (
  query: {
    page: number;
    pageSize: number;
    categoryId?: string;
    search?: string;
    platform?: 'IG' | 'TikTok' | 'FB';
    location?: string;
    minPayout?: number;
    maxPayout?: number;
    deadlineBefore?: string;
  }
) => {
  const where: Prisma.MissionWhereInput = {
    status: { in: ['PUBLISHED', 'IN_PROGRESS'] },
    deadline: {
      gte: new Date(),
      ...(query.deadlineBefore ? { lte: new Date(query.deadlineBefore) } : {})
    },
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } }
          ]
        }
      : {}),
    ...(query.platform
      ? {
          platformRequirements: {
            array_contains: [query.platform]
          }
        }
      : {}),
    ...(query.location
      ? {
          location: {
            contains: query.location,
            mode: 'insensitive'
          }
        }
      : {})
  };

  const [rawItems, total] = await Promise.all([
    prisma.mission.findMany({
      where,
      include: {
        category: true,
        merchantProfile: {
          select: {
            companyName: true
          }
        },
        _count: {
          select: {
            applications: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    }),
    prisma.mission.count({ where })
  ]);

  const items = rawItems.filter((mission) => {
    const budget = mission.pricingMode === 'COMMISSION_POOL' ? Number(mission.commissionPoolAmount ?? 0) : Number(mission.fixedBudgetAmount ?? 0);
    const payout = budget / mission.quota;
    if (query.minPayout && payout < query.minPayout) return false;
    if (query.maxPayout && payout > query.maxPayout) return false;
    return true;
  });

  return {
    items,
    meta: toMeta(query.page, query.pageSize, total)
  };
};

export const applyMission = async (userId: string, missionId: string) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  if (profile.verificationStatus !== 'APPROVED') {
    throw new AppError('Verification must be approved before applying missions', 422);
  }

  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    include: { merchantProfile: true }
  });

  if (!mission || !['PUBLISHED', 'IN_PROGRESS'].includes(mission.status)) {
    throw new AppError('Mission is not available', 404);
  }

  const acceptedCount = await prisma.missionApplication.count({
    where: {
      missionId,
      status: 'ACCEPTED'
    }
  });

  if (acceptedCount >= mission.quota) {
    throw new AppError('Mission quota is full', 422);
  }

  const application = await prisma.missionApplication.create({
    data: {
      missionId,
      influencerId: profile.id,
      status: 'APPLIED'
    }
  });

  await createNotification({
    userId: mission.merchantProfile.userId,
    type: NotificationType.APPLICATION,
    title: 'New mission application',
    message: `A new influencer applied to ${mission.title}`,
    metadata: { missionId, applicationId: application.id }
  });

  return application;
};

export const listInfluencerApplications = async (userId: string, page: number, pageSize: number) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  const where = { influencerId: profile.id };

  const [items, total] = await Promise.all([
    prisma.missionApplication.findMany({
      where,
      include: {
        mission: {
          include: {
            category: true
          }
        },
        submission: true
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.missionApplication.count({ where })
  ]);

  return {
    items,
    meta: toMeta(page, pageSize, total)
  };
};

export const submitMissionProof = async (
  userId: string,
  payload: {
    applicationId: string;
    caption: string;
    links: string[];
    proofImages: string[];
  }
) => {
  const profile = await getInfluencerProfileOrThrow(userId);

  const application = await prisma.missionApplication.findUnique({
    where: { id: payload.applicationId },
    include: {
      mission: {
        include: { merchantProfile: true }
      },
      submission: true
    }
  });

  if (!application || application.influencerId !== profile.id) {
    throw new AppError('Application not found', 404);
  }

  if (application.status !== 'ACCEPTED') {
    throw new AppError('Application is not accepted', 422);
  }

  const data = {
    missionId: application.missionId,
    applicationId: application.id,
    influencerId: profile.id,
    caption: payload.caption,
    proofLinks: payload.links as any,
    proofImages: payload.proofImages as any,
    status: 'SUBMITTED' as const,
    reviewNote: null
  };

  const submission = application.submission
    ? await prisma.missionSubmission.update({
        where: { applicationId: application.id },
        data
      })
    : await prisma.missionSubmission.create({ data });

  await createNotification({
    userId: application.mission.merchantProfile.userId,
    type: NotificationType.SUBMISSION,
    title: 'Mission proof submitted',
    message: `Submission received for ${application.mission.title}`,
    metadata: { missionId: application.missionId, submissionId: submission.id }
  });

  return submission;
};

export const getEarningsSummary = async (userId: string, page: number, pageSize: number) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  if (!profile.pointsAccount) {
    throw new AppError('Points account not found', 404);
  }

  const where = { pointsAccountId: profile.pointsAccount.id };
  const settings = await getFinanceSettings();
  const [items, total] = await Promise.all([
    prisma.pointsLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.pointsLedger.count({ where })
  ]);

  return {
    balancePoints: profile.pointsAccount.balancePoints,
    estimatedMyr: Number((profile.pointsAccount.balancePoints * settings.pointsToMyrRate).toFixed(2)),
    ledger: {
      items,
      meta: toMeta(page, pageSize, total)
    }
  };
};

export const requestWithdrawal = async (userId: string, points: number) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  const settings = await getFinanceSettings();
  if (!profile.pointsAccount) {
    throw new AppError('Points account not found', 404);
  }

  if (profile.pointsAccount.balancePoints < points) {
    throw new AppError('Insufficient points balance', 422);
  }

  const amountMYR = Number((points * settings.pointsToMyrRate).toFixed(2));
  if (amountMYR < settings.minWithdrawalMyr) {
    throw new AppError(`Minimum withdrawal is RM ${settings.minWithdrawalMyr}`, 422);
  }

  return prisma.$transaction(async (tx) => {
    await tx.pointsAccount.update({
      where: { id: profile.pointsAccount!.id },
      data: { balancePoints: { decrement: points } }
    });

    await tx.pointsLedger.create({
      data: {
        pointsAccountId: profile.pointsAccount!.id,
        points: -points,
        type: 'WITHDRAWAL_DEBIT',
        reference: `WDR-${Date.now()}`,
        notes: 'Withdrawal request'
      }
    });

    const withdrawal = await tx.withdrawal.create({
      data: {
        influencerId: profile.id,
        pointsUsed: points,
        amountMYR,
        status: 'PENDING'
      }
    });

    return withdrawal;
  });
};

export const listWithdrawals = async (userId: string, page: number, pageSize: number) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  const where = { influencerId: profile.id };

  const [items, total] = await Promise.all([
    prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.withdrawal.count({ where })
  ]);

  return {
    items,
    meta: toMeta(page, pageSize, total)
  };
};

export const listInfluencerNotifications = async (userId: string, page: number, pageSize: number) => {
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

export const openDispute = async (userId: string, payload: { applicationId: string; reason: string; details: string }) => {
  const profile = await getInfluencerProfileOrThrow(userId);

  const application = await prisma.missionApplication.findUnique({
    where: { id: payload.applicationId },
    include: {
      mission: true
    }
  });

  if (!application || application.influencerId !== profile.id) {
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

export const listMyChats = async (userId: string) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  return prisma.chat.findMany({
    where: { influencerId: profile.id },
    include: {
      mission: { select: { title: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { sender: { select: { email: true } } }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });
};

export const getChatMessages = async (userId: string, applicationId: string, page: number, pageSize: number) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  const chat = await prisma.chat.findUnique({
    where: { applicationId },
    include: {
      mission: true
    }
  });

  if (!chat || chat.influencerId !== profile.id) {
    throw new AppError('Chat not found', 404);
  }

  const where = { chatId: chat.id };
  const [items, total] = await Promise.all([
    prisma.chatMessage.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.chatMessage.count({ where })
  ]);

  return {
    chat,
    items: items.reverse(),
    meta: toMeta(page, pageSize, total)
  };
};

export const sendChatMessage = async (userId: string, applicationId: string, content: string) => {
  const profile = await getInfluencerProfileOrThrow(userId);

  const chat = await prisma.chat.findUnique({
    where: { applicationId },
    include: {
      mission: {
        include: {
          merchantProfile: true
        }
      }
    }
  });

  if (!chat || chat.influencerId !== profile.id) {
    throw new AppError('Chat not found', 404);
  }

  const message = await prisma.chatMessage.create({
    data: {
      chatId: chat.id,
      senderId: userId,
      content
    },
    include: {
      sender: { select: { id: true, email: true, role: true } }
    }
  });

  await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });

  await createNotification({
    userId: chat.mission.merchantProfile.userId,
    type: NotificationType.SYSTEM,
    title: 'New chat message',
    message: `New message on mission ${chat.mission.title}`,
    metadata: { applicationId, chatId: chat.id }
  });

  return message;
};

export const getCommerceState = async (userId: string) => getInfluencerCommerceState(userId);

export const addCommerceAddress = async (
  userId: string,
  payload: {
    label: string;
    recipientName: string;
    phone: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    isDefault?: boolean;
  }
) => createCommerceAddress(userId, payload);

export const markDefaultCommerceAddress = async (userId: string, addressId: string) =>
  setDefaultCommerceAddress(userId, addressId);

export const createCommerceOrder = async (
  userId: string,
  payload: {
    productItems: Array<{ productId: string; quantity: number }>;
    addressId: string;
    note?: string;
    source?: 'AFFILIATE_LINK' | 'SELF_PURCHASE';
  }
) => createInfluencerCommerceOrder(userId, payload);

export const getMediaKit = async (userId: string) => getInfluencerMediaKit(userId);

export const saveMediaKit = async (userId: string, payload: Record<string, unknown>) => updateInfluencerMediaKit(userId, payload);

export const saveCommercePreferences = async (
  userId: string,
  payload: Partial<{
    orderUpdates: boolean;
    promoAlerts: boolean;
    rememberCheckoutAddress: boolean;
  }>
) => updateCommercePreferences(userId, payload);
