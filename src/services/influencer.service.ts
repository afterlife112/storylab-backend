import { many, one } from '../database/query';
import { transaction } from '../database/transaction';
import { AppError } from '../utils/app-error';
import { toMeta } from '../utils/pagination';
import { getFinanceSettings } from './settings.service';
import * as publicService from './public.service';
import {
  createCommerceAddress,
  createInfluencerCommerceOrder,
  getInfluencerCommerceState,
  getInfluencerMediaKit,
  setDefaultCommerceAddress,
  updateCommercePreferences,
  updateInfluencerMediaKit
} from './commerce.service';

type UserRow = {
  id: string;
  email: string;
  phone: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  follower_count: number;
  verification_status: string;
  proof_image_url: string | null;
  created_at?: Date | string;
  updated_at?: Date | string;
};

type MissionParticipantRow = {
  id: string;
  mission_id: string;
  user_id: string;
  proof_text: string | null;
  proof_link: string | null;
  proof_images: string | null;
  platform: string | null;
  submission_note: string | null;
  reward_points: number;
  rewarded_at: Date | string | null;
  joined_at: Date | string;
  submitted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  title?: string;
  description?: string | null;
  location?: string | null;
  requirement?: string | null;
  proof_requirement?: string | null;
  reward_budget_amount?: number | string;
  max_creators?: number;
  joined_count?: number;
  end_date?: Date | string | null;
  category_id?: string | null;
  category_name?: string | null;
  merchant_id?: string;
  merchant_company_name?: string | null;
  merchant_logo_url?: string | null;
};

type WithdrawalRow = {
  id: string;
  user_id: string;
  points: number;
  myr_amount: number | string;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  status: string;
  admin_note: string | null;
  requested_at: Date | string;
  approved_at: Date | string | null;
  paid_at: Date | string | null;
  rejected_at: Date | string | null;
};

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

const parseTextList = (value: string | null | undefined) => {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    // ignore
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const stringifyTextList = (value: string[] | undefined | null) => JSON.stringify((value ?? []).filter(Boolean));

const parseChecklist = (value: string | null) =>
  (value ?? '')
    .split(/[;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const getUserOrThrow = async (userId: string) => {
  const row = await one<UserRow>(
    `
      select *
      from users
      where id = $1
      limit 1
    `,
    [userId]
  );
  if (!row) throw new AppError('Influencer profile not found', 404);
  return row;
};

const deriveSubmissionStatus = (participant: MissionParticipantRow) => {
  if (participant.rewarded_at) return 'APPROVED';
  if (participant.submitted_at) return 'PENDING';
  return 'NOT_SUBMITTED';
};

const serializeMissionFromParticipant = (row: MissionParticipantRow) => ({
  id: row.mission_id,
  title: row.title ?? 'Mission',
  description: row.description ?? '',
  status: row.end_date && new Date(row.end_date).getTime() < Date.now() ? 'COMPLETED' : 'PUBLISHED',
  deadline: row.end_date ? new Date(row.end_date).toISOString() : null,
  quota: row.max_creators ?? 0,
  location: row.location,
  pricingMode: 'FIXED_BUDGET' as const,
  commissionPoolAmount: null,
  fixedBudgetAmount: toNumber(row.reward_budget_amount),
  platformRequirements: parseChecklist(row.requirement ?? null),
  deliverablesChecklist: parseChecklist(row.proof_requirement || row.requirement || null),
  category: row.category_id ? { id: row.category_id, name: row.category_name ?? 'General' } : null,
  merchantProfile: {
    companyName: row.merchant_company_name ?? 'Merchant',
    logoUrl: row.merchant_logo_url ?? null
  },
  _count: {
    applications: row.joined_count ?? 0
  },
  rewardPoints: row.reward_points
});

const serializeApplication = (row: MissionParticipantRow) => ({
  id: row.id,
  missionId: row.mission_id,
  status: 'ACCEPTED',
  createdAt: new Date(row.joined_at).toISOString(),
  mission: serializeMissionFromParticipant(row),
  submission: row.submitted_at
    ? {
        status: deriveSubmissionStatus(row),
        caption: row.proof_text,
        links: row.proof_link ? [row.proof_link] : [],
        proofImages: parseTextList(row.proof_images),
        submittedAt: new Date(row.submitted_at).toISOString()
      }
    : null
});

const getAvailableBalancePoints = async (userId: string) => {
  const [earnedRow, withdrawnRow] = await Promise.all([
    one<{ total: string }>(
      `
        select coalesce(sum(reward_points), 0)::text as total
        from mission_participants
        where user_id = $1
          and rewarded_at is not null
      `,
      [userId]
    ),
    one<{ total: string }>(
      `
        select coalesce(sum(points), 0)::text as total
        from user_withdrawals
        where user_id = $1
          and status in ('PENDING', 'APPROVED', 'PAID')
      `,
      [userId]
    )
  ]);

  return Number(earnedRow?.total ?? 0) - Number(withdrawnRow?.total ?? 0);
};

export const getInfluencerProfile = async (userId: string) => getUserOrThrow(userId);

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
  const current = await getUserOrThrow(userId);
  const proofImageUrl = payload.proofImageUrl ?? current.proof_image_url;
  if (!proofImageUrl) throw new AppError('Follower proof image is required', 422);

  const updated = await one<UserRow>(
    `
      update users
      set
        instagram_url = $2,
        tiktok_url = $3,
        follower_count = $4,
        phone = $5,
        proof_image_url = $6,
        verification_status = 'PENDING',
        updated_at = now()
      where id = $1
      returning *
    `,
    [userId, payload.igLink, payload.tiktokLink ?? null, payload.followerCount, payload.phone, proofImageUrl]
  );

  if (!updated) throw new AppError('Influencer profile not found', 404);
  return updated;
};

export const requestPhoneOtp = async (_phone: string) => {
  throw new AppError('OTP verification is not supported by the current database schema', 501);
};

export const verifyPhoneOtp = async (_userId: string, _phone: string, _code: string) => {
  throw new AppError('OTP verification is not supported by the current database schema', 501);
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
  const result = await publicService.listPublishedMissions(query);
  const items = result.items.filter((mission) => {
    const payout = mission.quota > 0 ? mission.fixedBudgetAmount / mission.quota : 0;
    if (query.minPayout && payout < query.minPayout) return false;
    if (query.maxPayout && payout > query.maxPayout) return false;
    if (query.deadlineBefore && mission.deadline && new Date(mission.deadline).getTime() > new Date(query.deadlineBefore).getTime()) return false;
    return true;
  });

  return {
    items,
    meta: result.meta
  };
};

export const applyMission = async (userId: string, missionId: string) => {
  const user = await getUserOrThrow(userId);
  if (user.verification_status !== 'VERIFIED') {
    throw new AppError('Verification must be approved before applying missions', 422);
  }

  const mission = await one<{
    id: string;
    max_creators: number;
    joined_count: number;
    end_date: Date | string | null;
  }>(
    `
      select id, max_creators, joined_count, end_date
      from missions
      where id = $1
      limit 1
    `,
    [missionId]
  );

  if (!mission) throw new AppError('Mission is not available', 404);
  if (mission.end_date && new Date(mission.end_date).getTime() < Date.now()) throw new AppError('Mission is not available', 404);
  if (mission.joined_count >= mission.max_creators) throw new AppError('Mission quota is full', 422);

  const existing = await one<{ id: string }>(
    `
      select id
      from mission_participants
      where mission_id = $1 and user_id = $2
      limit 1
    `,
    [missionId, userId]
  );
  if (existing) throw new AppError('Mission already joined', 409);

  const participant = await transaction(async (client) => {
    const created = await one<MissionParticipantRow>(
      `
        insert into mission_participants (mission_id, user_id, joined_at, created_at, updated_at)
        values ($1, $2, now(), now(), now())
        returning *
      `,
      [missionId, userId],
      client
    );

    await one(
      `
        update missions
        set joined_count = joined_count + 1, updated_at = now()
        where id = $1
        returning id
      `,
      [missionId],
      client
    );

    return created;
  });

  return participant;
};

export const listInfluencerApplications = async (userId: string, page: number, pageSize: number) => {
  await getUserOrThrow(userId);
  const offset = (page - 1) * pageSize;
  const rows = await many<MissionParticipantRow>(
    `
      select
        mp.*,
        m.title,
        m.description,
        m.location,
        m.requirement,
        m.proof_requirement,
        m.budget_amount as reward_budget_amount,
        m.max_creators,
        m.joined_count,
        m.end_date,
        m.category_id,
        c.name as category_name,
        m.merchant_id,
        merchant.company_name as merchant_company_name,
        merchant.logo_url as merchant_logo_url
      from mission_participants mp
      join missions m on m.id = mp.mission_id
      left join categories c on c.id = m.category_id
      join merchants merchant on merchant.id = m.merchant_id
      where mp.user_id = $1
      order by mp.joined_at desc
      offset $2
      limit $3
    `,
    [userId, offset, pageSize]
  );
  const totalRow = await one<{ count: string }>(
    `select count(*)::text as count from mission_participants where user_id = $1`,
    [userId]
  );

  return {
    items: rows.map(serializeApplication),
    meta: toMeta(page, pageSize, Number(totalRow?.count ?? 0))
  };
};

export const submitMissionProof = async (
  userId: string,
  payload: {
    applicationId: string;
    caption: string;
    links: string[];
    proofImages?: string[];
  }
) => {
  const participant = await one<MissionParticipantRow>(
    `
      select *
      from mission_participants
      where id = $1 and user_id = $2
      limit 1
    `,
    [payload.applicationId, userId]
  );
  if (!participant) throw new AppError('Mission application not found', 404);

  const updated = await one<MissionParticipantRow>(
    `
      update mission_participants
      set
        proof_text = $3,
        proof_link = $4,
        proof_images = $5,
        submitted_at = now(),
        updated_at = now()
      where id = $1 and user_id = $2
      returning *
    `,
    [
      payload.applicationId,
      userId,
      payload.caption,
      payload.links[0] ?? null,
      stringifyTextList(payload.proofImages)
    ]
  );

  if (!updated) throw new AppError('Mission application not found', 404);
  return {
    id: updated.id,
    status: deriveSubmissionStatus(updated),
    caption: updated.proof_text,
    links: updated.proof_link ? [updated.proof_link] : [],
    proofImages: parseTextList(updated.proof_images),
    submittedAt: updated.submitted_at ? new Date(updated.submitted_at).toISOString() : null
  };
};

export const getEarningsSummary = async (userId: string, page: number, pageSize: number) => {
  await getUserOrThrow(userId);
  const finance = await getFinanceSettings();
  const balancePoints = await getAvailableBalancePoints(userId);
  const lifetimeEarnedRow = await one<{ total: string }>(
    `
      select coalesce(sum(reward_points), 0)::text as total
      from mission_participants
      where user_id = $1 and rewarded_at is not null
    `,
    [userId]
  );

  const missionLedger = await many<{
    id: string;
    created_at: Date | string;
    reward_points: number;
    title: string;
  }>(
    `
      select mp.id, mp.rewarded_at as created_at, mp.reward_points, m.title
      from mission_participants mp
      join missions m on m.id = mp.mission_id
      where mp.user_id = $1 and mp.rewarded_at is not null
      order by mp.rewarded_at desc
    `,
    [userId]
  );

  const ledgerItems = missionLedger.slice((page - 1) * pageSize, page * pageSize).map((item) => ({
    id: item.id,
    type: 'MISSION_EARNING',
    points: item.reward_points,
    notes: `Reward for ${item.title}`,
    createdAt: new Date(item.created_at).toISOString()
  }));

  return {
    balancePoints,
    lifetimeEarnedPoints: Number(lifetimeEarnedRow?.total ?? 0),
    estimatedMyr: Number((balancePoints * finance.pointsToMyrRate).toFixed(2)),
    ledger: {
      items: ledgerItems,
      total: missionLedger.length,
      page,
      pageSize
    }
  };
};

export const requestWithdrawal = async (userId: string, points: number) => {
  await getUserOrThrow(userId);
  const finance = await getFinanceSettings();
  const balancePoints = await getAvailableBalancePoints(userId);
  if (points > balancePoints) throw new AppError('Insufficient points balance', 422);

  const myrAmount = Number((points * finance.pointsToMyrRate).toFixed(2));
  const row = await one<WithdrawalRow>(
    `
      insert into user_withdrawals (
        user_id,
        points,
        myr_amount,
        bank_name,
        bank_account_name,
        bank_account_no,
        status,
        requested_at
      )
      values ($1, $2, $3, '', '', '', 'PENDING', now())
      returning *
    `,
    [userId, points, myrAmount]
  );
  if (!row) throw new AppError('Failed to create withdrawal', 500);
  return row;
};

export const listWithdrawals = async (userId: string, page: number, pageSize: number) => {
  await getUserOrThrow(userId);
  const offset = (page - 1) * pageSize;
  const rows = await many<WithdrawalRow>(
    `
      select *
      from user_withdrawals
      where user_id = $1
      order by requested_at desc
      offset $2
      limit $3
    `,
    [userId, offset, pageSize]
  );
  const totalRow = await one<{ count: string }>(`select count(*)::text as count from user_withdrawals where user_id = $1`, [userId]);
  return {
    items: rows,
    meta: toMeta(page, pageSize, Number(totalRow?.count ?? 0))
  };
};

export const listInfluencerNotifications = async (_userId: string, page: number, pageSize: number) => ({
  items: [],
  meta: toMeta(page, pageSize, 0)
});

export const openDispute = async (_userId: string, _payload: { applicationId: string; reason: string; details: string }) => {
  throw new AppError('Disputes are not supported by the current database schema', 501);
};

export const listMyChats = async () => [];

export const getChatMessages = async (_userId: string, _applicationId: string, page: number, pageSize: number) => ({
  chat: null,
  items: [],
  meta: toMeta(page, pageSize, 0)
});

export const sendChatMessage = async () => {
  throw new AppError('Chats are not supported by the current database schema', 501);
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
    addressId?: string;
    note?: string;
    source?: string;
    receiverName?: string;
    receiverPhone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  }
) => createInfluencerCommerceOrder(userId, payload);

export const getMediaKit = async (userId: string) => getInfluencerMediaKit(userId);

export const saveMediaKit = async (userId: string, payload: Record<string, unknown>) => updateInfluencerMediaKit(userId, payload);

export const saveCommercePreferences = async (userId: string, payload: Partial<{ orderUpdates: boolean; promoAlerts: boolean; rememberCheckoutAddress: boolean }>) =>
  updateCommercePreferences(userId, payload);
