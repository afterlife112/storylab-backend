import { AccountStatus, DisputeStatus, MissionStatus, NotificationType, Prisma, VerificationStatus, WithdrawalStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/app-error';
import { toMeta } from '../utils/pagination';
import { createNotification } from './notification.service';
import { getFinanceSettings, updateFinanceSettings } from './settings.service';

export const getDashboardMetrics = async () => {
  const [topupAgg, activeMissions, pendingVerifications, pendingWithdrawals] = await Promise.all([
    prisma.merchantWalletLedger.aggregate({
      where: { type: 'TOPUP', direction: 'CREDIT' },
      _sum: { amount: true }
    }),
    prisma.mission.count({ where: { status: { in: ['PUBLISHED', 'IN_PROGRESS'] } } }),
    prisma.influencerProfile.count({ where: { verificationStatus: 'PENDING' } }),
    prisma.withdrawal.count({ where: { status: 'PENDING' } })
  ]);

  return {
    totalTopupsGmv: Number(topupAgg._sum.amount ?? 0),
    activeMissions,
    pendingInfluencerVerifications: pendingVerifications,
    pendingWithdrawals
  };
};

export const listCategories = async () => {
  return prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
};

export const createCategory = async (payload: { name: string; sortOrder: number; isEnabled: boolean }) => {
  return prisma.category.create({ data: payload });
};

export const updateCategory = async (id: string, payload: { name: string; sortOrder: number; isEnabled: boolean }) => {
  return prisma.category.update({ where: { id }, data: payload });
};

export const deleteCategory = async (id: string) => {
  return prisma.category.delete({ where: { id } });
};

export const reorderCategories = async (order: { id: string; sortOrder: number }[]) => {
  await prisma.$transaction(order.map((row) => prisma.category.update({ where: { id: row.id }, data: { sortOrder: row.sortOrder } })));
  return listCategories();
};

export const listVerifications = async (page: number, pageSize: number, status?: VerificationStatus) => {
  const where = {
    ...(status ? { verificationStatus: status } : {})
  };
  const [items, total] = await Promise.all([
    prisma.influencerProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.influencerProfile.count({ where })
  ]);

  return { items, meta: toMeta(page, pageSize, total) };
};

export const decideVerification = async (influencerId: string, status: VerificationStatus, notes: string) => {
  const updated = await prisma.influencerProfile.update({
    where: { id: influencerId },
    data: {
      verificationStatus: status,
      verificationNotes: notes
    },
    include: { user: true }
  });

  await createNotification({
    userId: updated.userId,
    type: NotificationType.VERIFICATION,
    title: 'Verification status updated',
    message: `Your verification is ${status.toLowerCase()}`,
    metadata: { notes }
  });

  return updated;
};

export const moderateMission = async (missionId: string, suspended: boolean, reason?: string) => {
  const status: MissionStatus = suspended ? 'SUSPENDED' : 'PUBLISHED';
  return prisma.mission.update({
    where: { id: missionId },
    data: {
      status,
      suspendedReason: suspended ? reason ?? 'Suspended by admin' : null
    }
  });
};

export const listUsers = async (page: number, pageSize: number, role?: 'ADMIN' | 'MERCHANT' | 'INFLUENCER') => {
  const where = role ? { role } : {};
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        merchantProfile: true,
        influencerProfile: true
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.user.count({ where })
  ]);
  return { items, meta: toMeta(page, pageSize, total) };
};

export const updateUserStatus = async (userId: string, status: AccountStatus) => {
  return prisma.user.update({ where: { id: userId }, data: { status } });
};

export const getFinanceConfig = async () => getFinanceSettings();

export const updateFinanceConfig = async (payload: {
  platformFeePercent: number;
  pointsToMyrRate: number;
  minWithdrawalMyr: number;
}) => updateFinanceSettings(payload);

export const listWithdrawalsAdmin = async (page: number, pageSize: number, status?: WithdrawalStatus) => {
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    prisma.withdrawal.findMany({
      where,
      include: {
        influencer: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.withdrawal.count({ where })
  ]);
  return { items, meta: toMeta(page, pageSize, total) };
};

export const updateWithdrawalStatus = async (
  withdrawalId: string,
  payload: {
    status: WithdrawalStatus;
    payoutRef?: string;
    adminNotes?: string;
  }
) => {
  const withdrawal = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    include: {
      influencer: {
        include: {
          pointsAccount: true,
          user: true
        }
      }
    }
  });

  if (!withdrawal) throw new AppError('Withdrawal not found', 404);

  if (payload.status === 'PAID' && !payload.payoutRef) {
    throw new AppError('payoutRef is required when marking as PAID', 422);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: payload.status,
        payoutRef: payload.payoutRef,
        adminNotes: payload.adminNotes
      }
    });

    if (payload.status === 'REJECTED' && withdrawal.status !== 'REJECTED') {
      const pointsAccount = withdrawal.influencer.pointsAccount;
      if (pointsAccount) {
        await tx.pointsAccount.update({
          where: { id: pointsAccount.id },
          data: { balancePoints: { increment: withdrawal.pointsUsed } }
        });

        await tx.pointsLedger.create({
          data: {
            pointsAccountId: pointsAccount.id,
            points: withdrawal.pointsUsed,
            type: 'ADJUSTMENT',
            reference: `WDR-REFUND-${withdrawal.id}`,
            notes: 'Withdrawal rejected refund'
          }
        });
      }
    }

    return next;
  });

  await createNotification({
    userId: withdrawal.influencer.userId,
    type: NotificationType.WITHDRAWAL,
    title: 'Withdrawal updated',
    message: `Withdrawal status is ${payload.status.toLowerCase()}`,
    metadata: {
      withdrawalId,
      payoutRef: payload.payoutRef,
      adminNotes: payload.adminNotes
    }
  });

  return updated;
};

export const listAuditLogs = async (page: number, pageSize: number) => {
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      include: {
        admin: {
          select: {
            email: true,
            id: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.auditLog.count()
  ]);

  return {
    items,
    meta: toMeta(page, pageSize, total)
  };
};

export const listDisputes = async (page: number, pageSize: number, status?: DisputeStatus) => {
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    prisma.dispute.findMany({
      where,
      include: {
        mission: { select: { title: true } },
        application: true,
        openedBy: { select: { id: true, email: true, role: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.dispute.count({ where })
  ]);
  return { items, meta: toMeta(page, pageSize, total) };
};

export const resolveDispute = async (disputeId: string, status: Extract<DisputeStatus, 'RESOLVED' | 'REJECTED'>, resolutionNote: string, adminId: string) => {
  const dispute = await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status,
      resolutionNote,
      resolvedById: adminId
    }
  });

  return dispute;
};