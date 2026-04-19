import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { toMeta } from '../utils/pagination';
import { getFinanceSettings } from './settings.service';
import {
  createMerchantLandingCheckout,
  getPublicShopProductBySlug,
  listMerchantLandingProducts,
  listPublicShopCategories,
  listPublicShopProducts
} from './commerce.service';

export const listPublicCategories = async () => {
  return prisma.category.findMany({
    where: { isEnabled: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  });
};

export const listPublishedMissions = async (query: {
  page: number;
  pageSize: number;
  categoryId?: string;
  search?: string;
  platform?: 'IG' | 'TikTok' | 'FB';
  location?: string;
}) => {
  const where: Prisma.MissionWhereInput = {
    status: { in: ['PUBLISHED', 'IN_PROGRESS'] },
    deadline: { gte: new Date() },
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } }
          ]
        }
      : {}),
    ...(query.platform ? { platformRequirements: { array_contains: [query.platform] } } : {}),
    ...(query.location
      ? {
          location: {
            contains: query.location,
            mode: 'insensitive'
          }
        }
      : {})
  };

  const [items, total] = await Promise.all([
    prisma.mission.findMany({
      where,
      include: {
        category: true,
        merchantProfile: {
          select: {
            companyName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    }),
    prisma.mission.count({ where })
  ]);

  return {
    items,
    meta: toMeta(query.page, query.pageSize, total)
  };
};

export const getPublishedMissionById = async (missionId: string) => {
  return prisma.mission.findFirst({
    where: {
      id: missionId,
      status: { in: ['PUBLISHED', 'IN_PROGRESS'] }
    },
    include: {
      category: true,
      merchantProfile: {
        select: { companyName: true, logoUrl: true }
      },
      _count: {
        select: { applications: true }
      }
    }
  });
};

export const getPublicConfig = async () => {
  const finance = await getFinanceSettings();
  return {
    finance
  };
};

export const getShopCategories = async () => listPublicShopCategories();

export const getShopProducts = async (query: { page: number; pageSize: number; category?: string; search?: string }) =>
  listPublicShopProducts(query);

export const getShopProductBySlug = async (slug: string) => getPublicShopProductBySlug(slug);

export const getMerchantLandingProducts = async (slug: string) => listMerchantLandingProducts(slug);

export const checkoutMerchantLanding = async (
  slug: string,
  payload: {
    buyerId?: string | null;
    productId: string;
    referrerId?: string | null;
    amount: number;
    quantity?: number;
    buyerName: string;
    buyerPhone: string;
    buyerEmail: string;
    note?: string;
  }
) => createMerchantLandingCheckout(slug, payload);
