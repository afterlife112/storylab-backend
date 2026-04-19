import { CheckInTokenStatus, NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';
import { toMeta } from '../utils/pagination';
import { randomToken, sha256 } from '../utils/token';
import { createNotification } from './notification.service';

const QR_TOKEN_TTL_MS = 5 * 60 * 1000;

const getInfluencerProfileOrThrow = async (userId: string) => {
  const profile = await prisma.influencerProfile.findUnique({
    where: { userId },
    include: {
      user: true
    }
  });

  if (!profile) {
    throw new AppError('Influencer profile not found', 404);
  }

  return profile;
};

const buildShareUrl = (slug: string) => `${env.FRONTEND_USER_ORIGIN}/merchant-landing/${slug}`;
const buildScanUrl = (token: string) => `${env.FRONTEND_USER_ORIGIN}/merchant-landing/check-in/${token}`;

const asStringMap = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const getSocialValue = (socials: unknown, key: string) => {
  const value = asStringMap(socials)[key];
  if (typeof value === 'string') {
    return value;
  }
  return null;
};

const getLandingBySlugOrThrow = async (slug: string) => {
  const landing = await prisma.merchantLanding.findUnique({
    where: { slug },
    include: {
      merchant: true,
      influencer: {
        include: {
          user: {
            select: {
              id: true,
              email: true
            }
          }
        }
      },
      mission: {
        include: {
          category: true
        }
      },
      application: true,
      checkInRecords: {
        orderBy: { checkedInAt: 'desc' },
        take: 1
      }
    }
  });

  if (!landing || landing.status !== 'ACTIVE') {
    throw new AppError('Merchant landing page not found', 404, { code: 'LANDING_NOT_FOUND' });
  }

  if (landing.application.status !== 'ACCEPTED') {
    throw new AppError('Merchant landing page is not available', 422, { code: 'LANDING_NOT_AVAILABLE' });
  }

  return landing;
};

const serializeLanding = (landing: Awaited<ReturnType<typeof getLandingBySlugOrThrow>>) => {
  const businessType = getSocialValue(landing.merchant.socials, 'businessCategory') ?? landing.mission.category.name;
  const businessHours = getSocialValue(landing.merchant.socials, 'businessHours') ?? 'Daily | 10:00 AM - 10:00 PM';
  const website = getSocialValue(landing.merchant.socials, 'website');
  const instagram = getSocialValue(landing.merchant.socials, 'instagram');
  const facebook = getSocialValue(landing.merchant.socials, 'facebook');
  const tiktok = getSocialValue(landing.merchant.socials, 'tiktok');
  const whatsapp = getSocialValue(landing.merchant.socials, 'whatsapp');
  const coverImageUrl = getSocialValue(landing.merchant.socials, 'coverImageUrl');
  const shortDescription = getSocialValue(landing.merchant.socials, 'shortDescription') ?? landing.mission.description;
  const latestCheckIn = landing.checkInRecords[0] ?? null;

  return {
    id: landing.id,
    slug: landing.slug,
    shareUrl: buildShareUrl(landing.slug),
    merchant: {
      id: landing.merchant.id,
      name: landing.merchant.companyName,
      category: businessType,
      shortDescription,
      contactPerson: landing.merchant.contactPerson,
      phone: landing.merchant.phone,
      email: landing.merchant.email,
      address: landing.merchant.address,
      logoUrl: landing.merchant.logoUrl,
      coverImageUrl,
      businessHours,
      socials: {
        website,
        instagram,
        facebook,
        tiktok,
        whatsapp
      }
    },
    mission: {
      id: landing.mission.id,
      title: landing.mission.title,
      description: landing.mission.description,
      location: landing.mission.location,
      deadline: landing.mission.deadline,
      platformRequirements: landing.mission.platformRequirements,
      deliverablesChecklist: landing.mission.deliverablesChecklist,
      category: landing.mission.category
    },
    application: {
      id: landing.application.id,
      status: landing.application.status,
      createdAt: landing.application.createdAt
    },
    checkIn: {
      alreadyCheckedIn: Boolean(latestCheckIn),
      latestRecord: latestCheckIn
        ? {
            id: latestCheckIn.id,
            status: latestCheckIn.status,
            checkedInAt: latestCheckIn.checkedInAt
          }
        : null
    }
  };
};

const createLandingSlug = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = `ml-${randomToken(9)}`;
    const existing = await prisma.merchantLanding.findUnique({ where: { slug } });
    if (!existing) {
      return slug;
    }
  }

  throw new AppError('Unable to create merchant landing link', 500);
};

export const ensureMerchantLandingForAcceptedApplication = async (applicationId: string) => {
  const existing = await prisma.merchantLanding.findUnique({
    where: { applicationId }
  });

  if (existing) {
    return existing;
  }

  const application = await prisma.missionApplication.findUnique({
    where: { id: applicationId },
    include: {
      mission: true
    }
  });

  if (!application || application.status !== 'ACCEPTED') {
    throw new AppError('Accepted task is required before creating a merchant landing page', 422, {
      code: 'ACCEPTED_APPLICATION_REQUIRED'
    });
  }

  const slug = await createLandingSlug();

  return prisma.merchantLanding.create({
    data: {
      slug,
      missionId: application.missionId,
      applicationId: application.id,
      merchantId: application.mission.merchantProfileId,
      influencerId: application.influencerId,
      status: 'ACTIVE'
    }
  });
};

export const disableMerchantLandingForApplication = async (applicationId: string) => {
  await prisma.merchantLanding.updateMany({
    where: { applicationId },
    data: { status: 'DISABLED' }
  });

  await prisma.merchantCheckInToken.updateMany({
    where: {
      landing: {
        is: {
          applicationId
        }
      },
      status: 'ACTIVE'
    },
    data: {
      status: 'REVOKED'
    }
  });
};

export const getMerchantLandingForInfluencer = async (userId: string, applicationId: string) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  const application = await prisma.missionApplication.findUnique({
    where: { id: applicationId }
  });

  if (!application || application.influencerId !== profile.id) {
    throw new AppError('Accepted task not found', 404);
  }

  if (application.status !== 'ACCEPTED') {
    throw new AppError('Merchant landing link is available after the task is accepted', 422, {
      code: 'LANDING_NOT_READY'
    });
  }

  const landing = await ensureMerchantLandingForAcceptedApplication(application.id);

  await prisma.merchantLanding.update({
    where: { id: landing.id },
    data: { sharedAt: new Date() }
  });

  return serializeLanding(await getLandingBySlugOrThrow(landing.slug));
};

export const getPublicMerchantLanding = async (slug: string) => {
  return serializeLanding(await getLandingBySlugOrThrow(slug));
};

export const generateMerchantCheckInQr = async (userId: string, applicationId: string) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  const application = await prisma.missionApplication.findUnique({
    where: { id: applicationId },
    include: {
      merchantLanding: {
        include: {
          checkInRecords: {
            take: 1
          }
        }
      }
    }
  });

  if (!application || application.influencerId !== profile.id) {
    throw new AppError('Accepted task not found', 404);
  }

  if (application.status !== 'ACCEPTED') {
    throw new AppError('QR check-in becomes available after the task is accepted', 422, {
      code: 'QR_NOT_READY'
    });
  }

  const landing = application.merchantLanding ?? (await ensureMerchantLandingForAcceptedApplication(application.id));
  const existingCheckIn = await prisma.merchantCheckInRecord.findUnique({
    where: { applicationId: application.id }
  });

  if (existingCheckIn) {
    throw new AppError('This task has already been checked in', 422, {
      code: 'ALREADY_CHECKED_IN',
      checkedInAt: existingCheckIn.checkedInAt
    });
  }

  await prisma.merchantCheckInToken.updateMany({
    where: {
      landingId: landing.id,
      status: 'ACTIVE'
    },
    data: {
      status: 'REVOKED'
    }
  });

  const plainToken = randomToken(32);
  const expiresAt = new Date(Date.now() + QR_TOKEN_TTL_MS);

  await prisma.merchantCheckInToken.create({
    data: {
      landingId: landing.id,
      tokenHash: sha256(plainToken),
      status: 'ACTIVE',
      expiresAt
    }
  });

  return {
    landingId: landing.id,
    slug: landing.slug,
    expiresAt,
    ttlSeconds: Math.floor(QR_TOKEN_TTL_MS / 1000),
    scanUrl: buildScanUrl(plainToken)
  };
};

export const consumeMerchantCheckInToken = async (rawToken: string, metadata?: { ip?: string | null }) => {
  const tokenHash = sha256(rawToken);
  const token = await prisma.merchantCheckInToken.findUnique({
    where: { tokenHash },
    include: {
      landing: {
        include: {
          application: {
            include: {
              mission: true,
              influencer: {
                include: {
                  user: true
                }
              }
            }
          },
          merchant: true
        }
      },
      checkInRecord: true
    }
  });

  if (!token) {
    throw new AppError('QR code is invalid', 404, { code: 'INVALID_TOKEN' });
  }

  if (token.status === CheckInTokenStatus.USED || token.checkInRecord) {
    throw new AppError('QR code has already been used', 422, { code: 'TOKEN_ALREADY_USED' });
  }

  if (token.status !== CheckInTokenStatus.ACTIVE) {
    throw new AppError('QR code is no longer valid', 422, { code: 'TOKEN_NOT_ACTIVE' });
  }

  if (token.expiresAt.getTime() <= Date.now()) {
    await prisma.merchantCheckInToken.update({
      where: { id: token.id },
      data: {
        status: 'EXPIRED'
      }
    });

    throw new AppError('QR code has expired', 410, { code: 'TOKEN_EXPIRED', expiresAt: token.expiresAt });
  }

  if (token.landing.status !== 'ACTIVE' || token.landing.application.status !== 'ACCEPTED') {
    throw new AppError('Merchant landing is no longer available', 422, { code: 'LANDING_NOT_ACTIVE' });
  }

  const existingCheckIn = await prisma.merchantCheckInRecord.findUnique({
    where: { applicationId: token.landing.application.id }
  });

  if (existingCheckIn) {
    await prisma.merchantCheckInToken.update({
      where: { id: token.id },
      data: {
        status: 'USED',
        consumedAt: existingCheckIn.checkedInAt,
        consumedByIp: metadata?.ip ?? null
      }
    });

    throw new AppError('Task has already been checked in', 422, {
      code: 'ALREADY_CHECKED_IN',
      checkedInAt: existingCheckIn.checkedInAt
    });
  }

  const checkedInAt = new Date();
  const record = await prisma.$transaction(async (tx) => {
    await tx.merchantCheckInToken.update({
      where: { id: token.id },
      data: {
        status: 'USED',
        consumedAt: checkedInAt,
        consumedByIp: metadata?.ip ?? null
      }
    });

    return tx.merchantCheckInRecord.create({
      data: {
        landingId: token.landing.id,
        tokenId: token.id,
        missionId: token.landing.application.missionId,
        applicationId: token.landing.application.id,
        merchantId: token.landing.merchantId,
        influencerId: token.landing.influencerId,
        status: 'CHECKED_IN',
        checkedInAt
      }
    });
  });

  await createNotification({
    userId: token.landing.application.influencer.userId,
    type: NotificationType.SYSTEM,
    title: 'Merchant check-in completed',
    message: `${token.landing.merchant.companyName} checked you in for ${token.landing.application.mission.title}`,
    metadata: {
      applicationId: token.landing.application.id,
      missionId: token.landing.application.missionId,
      checkInRecordId: record.id
    }
  });

  return {
    id: record.id,
    status: record.status,
    checkedInAt: record.checkedInAt,
    merchant: {
      id: token.landing.merchant.id,
      name: token.landing.merchant.companyName
    },
    mission: {
      id: token.landing.application.mission.id,
      title: token.landing.application.mission.title
    }
  };
};

export const listInfluencerCheckInRecords = async (userId: string, page: number, pageSize: number) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  const where = { influencerId: profile.id };

  const [items, total] = await Promise.all([
    prisma.merchantCheckInRecord.findMany({
      where,
      include: {
        merchant: {
          select: {
            id: true,
            companyName: true,
            logoUrl: true
          }
        },
        mission: {
          select: {
            id: true,
            title: true
          }
        },
        application: {
          select: {
            id: true,
            status: true
          }
        },
        landing: {
          select: {
            slug: true
          }
        }
      },
      orderBy: { checkedInAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.merchantCheckInRecord.count({ where })
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      status: item.status,
      checkedInAt: item.checkedInAt,
      merchant: item.merchant,
      mission: item.mission,
      application: item.application,
      landingUrl: buildShareUrl(item.landing.slug)
    })),
    meta: toMeta(page, pageSize, total)
  };
};
