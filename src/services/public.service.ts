import { many, one } from '../database/query';
import { toMeta } from '../utils/pagination';
import { getFinanceSettings } from './settings.service';
import {
  createMerchantLandingCheckout,
  getPublicShopProductBySlug,
  listMerchantLandingProducts,
  listPublicShopCategories,
  listPublicShopProducts
} from './commerce.service';

type SnakeCategoryRow = {
  id: string;
  name: string;
  slug: string;
  icon_url: string | null;
  is_active: boolean;
  sort_order: number;
};

type SnakeMissionRow = {
  id: string;
  merchant_id: string;
  category_id: string;
  title: string;
  description: string;
  requirement: string | null;
  proof_requirement: string | null;
  location: string | null;
  reward_points: number;
  budget_amount: number | string;
  max_creators: number;
  joined_count: number;
  start_date: Date | string | null;
  end_date: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  category_name: string;
  merchant_company_name: string;
  merchant_logo_url: string | null;
};

const missionPlatformKeywords = [
  { label: 'IG', patterns: ['instagram', 'ig', 'reel', 'reels', 'story', 'stories'] },
  { label: 'TikTok', patterns: ['tiktok', 'tik tok'] },
  { label: 'FB', patterns: ['facebook', 'fb'] }
] as const;

const inferPlatformRequirements = (input: string | null) => {
  const text = input?.toLowerCase() ?? '';
  const matches = missionPlatformKeywords
    .filter(({ patterns }) => patterns.some((pattern) => text.includes(pattern)))
    .map(({ label }) => label);

  return matches.length ? matches : ['IG'];
};

const toChecklist = (input: string | null) =>
  input
    ? input
        .split(/[.;\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const normalizeDateString = (value: Date | string | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
};

const mapSnakeCategory = (row: SnakeCategoryRow) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  iconUrl: row.icon_url,
  isActive: row.is_active,
  sortOrder: row.sort_order
});

const mapSnakeMission = (row: SnakeMissionRow) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  status: 'PUBLISHED' as const,
  deadline: normalizeDateString(row.end_date) ?? normalizeDateString(row.updated_at)!,
  quota: row.max_creators,
  location: row.location,
  pricingMode: 'FIXED_BUDGET' as const,
  commissionPoolAmount: null,
  fixedBudgetAmount: Number(row.budget_amount ?? 0),
  platformRequirements: inferPlatformRequirements(row.requirement),
  deliverablesChecklist: toChecklist(row.proof_requirement || row.requirement),
  category: {
    id: row.category_id,
    name: row.category_name
  },
  merchantProfile: {
    companyName: row.merchant_company_name,
    logoUrl: row.merchant_logo_url
  },
  _count: {
    applications: row.joined_count
  },
  rewardPoints: row.reward_points,
  createdAt: normalizeDateString(row.created_at),
  updatedAt: normalizeDateString(row.updated_at)
});

export const listPublicCategories = async () => {
  const rows = await many<SnakeCategoryRow>(
    `
      select id, name, slug, icon_url, is_active, sort_order
      from categories
      where is_active = true
      order by sort_order asc, name asc
    `
  );

  return rows.map(mapSnakeCategory);
};

export const listPublishedMissions = async (query: {
  page: number;
  pageSize: number;
  categoryId?: string;
  search?: string;
  platform?: 'IG' | 'TikTok' | 'FB';
  location?: string;
}) => {
  const filters = ['(m.end_date is null or m.end_date >= current_date)', 'm.joined_count < m.max_creators'];
  const params: unknown[] = [];

  if (query.categoryId) {
    params.push(query.categoryId);
    filters.push(`m.category_id = $${params.length}`);
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    const index = params.length;
    filters.push(
      `(
        m.title ilike $${index}
        or m.description ilike $${index}
        or c.name ilike $${index}
        or merchant.company_name ilike $${index}
      )`
    );
  }

  if (query.location) {
    params.push(`%${query.location}%`);
    filters.push(`coalesce(m.location, '') ilike $${params.length}`);
  }

  if (query.platform) {
    params.push(`%${query.platform}%`);
    filters.push(`coalesce(m.requirement, '') ilike $${params.length}`);
  }

  const whereClause = filters.join(' and ');
  const offset = (query.page - 1) * query.pageSize;

  const rowsPromise = many<SnakeMissionRow>(
    `
      select
        m.id,
        m.merchant_id,
        m.category_id,
        m.title,
        m.description,
        m.requirement,
        m.proof_requirement,
        m.location,
        m.reward_points,
        m.budget_amount,
        m.max_creators,
        m.joined_count,
        m.start_date,
        m.end_date,
        m.created_at,
        m.updated_at,
        c.name as category_name,
        merchant.company_name as merchant_company_name,
        merchant.logo_url as merchant_logo_url
      from missions m
      join categories c on c.id = m.category_id
      join merchants merchant on merchant.id = m.merchant_id
      where ${whereClause}
      order by m.created_at desc
      offset $${params.length + 1}
      limit $${params.length + 2}
    `,
    [...params, offset, query.pageSize]
  );

  const totalPromise = many<{ count: string }>(
    `
      select count(*)::text as count
      from missions m
      join categories c on c.id = m.category_id
      join merchants merchant on merchant.id = m.merchant_id
      where ${whereClause}
    `,
    params
  );

  const [rows, totalRows] = await Promise.all([rowsPromise, totalPromise]);
  const total = Number(totalRows[0]?.count ?? 0);

  return {
    items: rows.map(mapSnakeMission),
    meta: toMeta(query.page, query.pageSize, total)
  };
};

export const getPublishedMissionById = async (missionId: string) => {
  const row = await one<SnakeMissionRow>(
    `
      select
        m.id,
        m.merchant_id,
        m.category_id,
        m.title,
        m.description,
        m.requirement,
        m.proof_requirement,
        m.location,
        m.reward_points,
        m.budget_amount,
        m.max_creators,
        m.joined_count,
        m.start_date,
        m.end_date,
        m.created_at,
        m.updated_at,
        c.name as category_name,
        merchant.company_name as merchant_company_name,
        merchant.logo_url as merchant_logo_url
      from missions m
      join categories c on c.id = m.category_id
      join merchants merchant on merchant.id = m.merchant_id
      where m.id = $1
        and (m.end_date is null or m.end_date >= current_date)
      limit 1
    `,
    [missionId]
  );

  return row ? mapSnakeMission(row) : null;
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
