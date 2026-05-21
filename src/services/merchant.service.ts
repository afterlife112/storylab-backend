import { many, one } from '../database/query';
import { transaction } from '../database/transaction';
import { MissionStatus, PricingMode } from '../constants/enums';
import { AppError } from '../utils/app-error';
import { getFinanceSettings } from './settings.service';
import { toMeta } from '../utils/pagination';
import {
  createMerchantProduct as createMerchantProductRecord,
  deleteMerchantProduct as deleteMerchantProductRecord,
  getMerchantProduct as getMerchantProductRecord,
  getMerchantVoucherByCode as getMerchantVoucherByCodeRecord,
  listMerchantProducts as listMerchantProductsRecord,
  redeemMerchantVoucher as redeemMerchantVoucherRecord,
  updateMerchantProduct as updateMerchantProductRecord
} from './commerce.service';

type MerchantRow = {
  id: string;
  email: string;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  status: string;
  created_at?: Date | string;
  updated_at?: Date | string;
};

type WalletRow = {
  id: string;
  merchant_id: string;
  balance: number | string;
  currency: string;
  created_at?: Date | string;
  updated_at?: Date | string;
};

type WalletLogRow = {
  id: string;
  merchant_wallet_account_id: string;
  type: string;
  source: string;
  amount: number | string;
  balance_before: number | string;
  balance_after: number | string;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: Date | string;
};

type MissionRow = {
  id: string;
  merchant_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
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
  category_name?: string | null;
};

type ParticipantRow = {
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
  email?: string;
  display_name?: string;
  avatar_url?: string | null;
  follower_count?: number;
  verification_status?: string;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  bio?: string | null;
};

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

const parseChecklist = (value: string | null) =>
  (value ?? '')
    .split(/[;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const stringifyChecklist = (values: string[]) => values.map((item) => item.trim()).filter(Boolean).join('; ');

const deriveMissionStatus = (mission: MissionRow): MissionStatus => {
  if (mission.end_date && new Date(mission.end_date).getTime() <= Date.now()) return 'COMPLETED';
  return 'PUBLISHED';
};

const deriveParticipantStatus = (participant: ParticipantRow) => {
  if (participant.rewarded_at) return 'APPROVED';
  if (participant.submitted_at) return 'PENDING';
  return 'ACCEPTED';
};

const getMerchantOrThrow = async (userId: string) => {
  const row = await one<MerchantRow>(
    `
      select *
      from merchants
      where id = $1
      limit 1
    `,
    [userId]
  );

  if (!row) throw new AppError('Merchant profile not found', 404);
  return row;
};

const getMerchantWalletOrThrow = async (merchantId: string) => {
  const row = await one<WalletRow>(
    `
      select *
      from merchant_wallet_accounts
      where merchant_id = $1
      limit 1
    `,
    [merchantId]
  );

  if (!row) throw new AppError('Wallet account not found', 404);
  return row;
};

const getMissionBudgetFromPayload = (payload: {
  pricingMode: PricingMode;
  commissionPoolAmount?: number;
  fixedBudgetAmount?: number;
}) => {
  const budget = payload.pricingMode === 'COMMISSION_POOL' ? payload.commissionPoolAmount : payload.fixedBudgetAmount;
  if (!budget || budget <= 0) {
    throw new AppError('Budget is required for selected pricing mode', 422);
  }
  return budget;
};

const serializeMerchant = (row: MerchantRow) => ({
  id: row.id,
  userId: row.id,
  companyName: row.company_name,
  contactPerson: row.contact_person ?? '',
  phone: row.phone ?? '',
  email: row.email,
  address: row.address ?? '',
  logoUrl: row.logo_url,
  socials: {
    website: row.website_url,
    facebook: row.facebook_url,
    instagram: row.instagram_url,
    tiktok: row.tiktok_url
  },
  createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
  updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
});

const serializeWallet = (row: WalletRow) => ({
  id: row.id,
  merchantId: row.merchant_id,
  balance: toNumber(row.balance),
  currency: row.currency,
  createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
  updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
});

const serializeMission = (row: MissionRow) => ({
  id: row.id,
  merchantId: row.merchant_id,
  categoryId: row.category_id,
  title: row.title,
  description: row.description ?? '',
  platformRequirements: parseChecklist(row.requirement),
  deliverablesChecklist: parseChecklist(row.proof_requirement || row.requirement),
  location: row.location,
  deadline: row.end_date ? new Date(row.end_date).toISOString() : null,
  quota: row.max_creators,
  joinedCount: row.joined_count,
  rewardPoints: row.reward_points,
  budgetAmount: toNumber(row.budget_amount),
  category: row.category_id ? { id: row.category_id, name: row.category_name ?? 'General' } : null,
  status: deriveMissionStatus(row),
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString()
});

const serializeParticipant = (row: ParticipantRow) => ({
  id: row.id,
  missionId: row.mission_id,
  influencerId: row.user_id,
  status: deriveParticipantStatus(row),
  joinedAt: new Date(row.joined_at).toISOString(),
  submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
  rewardedAt: row.rewarded_at ? new Date(row.rewarded_at).toISOString() : null,
  rewardPoints: row.reward_points,
  proofText: row.proof_text,
  proofLink: row.proof_link,
  proofImages: row.proof_images ? JSON.parse(row.proof_images) : [],
  platform: row.platform,
  submissionNote: row.submission_note,
  influencer: {
    id: row.user_id,
    user: {
      email: row.email ?? '',
      displayName: row.display_name ?? 'Creator',
      avatarUrl: row.avatar_url ?? null
    },
    email: row.email ?? '',
    displayName: row.display_name ?? 'Creator',
    avatarUrl: row.avatar_url ?? null,
    followerCount: row.follower_count ?? 0,
    verificationStatus: row.verification_status ?? 'PENDING',
    igLink: row.instagram_url ?? null,
    tiktokLink: row.tiktok_url ?? null,
    bio: row.bio ?? null
  }
});

const writeWalletLog = async (
  client: any,
  wallet: WalletRow,
  type: 'CREDIT' | 'DEBIT',
  source: string,
  amount: number,
  referenceType: string,
  referenceId: string,
  description: string
) => {
  const balanceBefore = toNumber(wallet.balance);
  const balanceAfter = type === 'DEBIT' ? balanceBefore - amount : balanceBefore + amount;

  if (type === 'DEBIT' && balanceAfter < 0) {
    throw new AppError('Insufficient wallet balance for mission pricing', 422);
  }

  const updatedWallet = await one<WalletRow>(
    `
      update merchant_wallet_accounts
      set balance = $2, updated_at = now()
      where id = $1
      returning *
    `,
    [wallet.id, balanceAfter],
    client
  );

  await one(
    `
      insert into merchant_wallet_logs (
        merchant_wallet_account_id,
        type,
        source,
        amount,
        balance_before,
        balance_after,
        reference_type,
        reference_id,
        description
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning id
    `,
    [wallet.id, type, source, amount, balanceBefore, balanceAfter, referenceType, referenceId, description],
    client
  );

  return updatedWallet ?? { ...wallet, balance: balanceAfter };
};

export const getMerchantProfile = async (userId: string) => {
  const merchant = await getMerchantOrThrow(userId);
  return serializeMerchant(merchant);
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
  const merchant = await one<MerchantRow>(
    `
      update merchants
      set
        company_name = $2,
        contact_person = $3,
        phone = $4,
        email = $5,
        address = $6,
        logo_url = $7,
        website_url = $8,
        facebook_url = $9,
        instagram_url = $10,
        tiktok_url = $11,
        updated_at = now()
      where id = $1
      returning *
    `,
    [
      userId,
      payload.companyName,
      payload.contactPerson,
      payload.phone,
      payload.email,
      payload.address,
      payload.logoUrl ?? null,
      typeof payload.socials?.website === 'string' ? payload.socials.website : null,
      typeof payload.socials?.facebook === 'string' ? payload.socials.facebook : null,
      typeof payload.socials?.instagram === 'string' ? payload.socials.instagram : null,
      typeof payload.socials?.tiktok === 'string' ? payload.socials.tiktok : null
    ]
  );

  if (!merchant) throw new AppError('Merchant profile not found', 404);
  return serializeMerchant(merchant);
};

export const getMerchantWallet = async (userId: string) => {
  const merchant = await getMerchantOrThrow(userId);
  const wallet = await getMerchantWalletOrThrow(merchant.id);
  return serializeWallet(wallet);
};

export const getMerchantWalletLedger = async (userId: string, page: number, pageSize: number) => {
  const merchant = await getMerchantOrThrow(userId);
  const wallet = await getMerchantWalletOrThrow(merchant.id);
  const offset = (page - 1) * pageSize;

  const [items, totalRow] = await Promise.all([
    many<WalletLogRow>(
      `
        select *
        from merchant_wallet_logs
        where merchant_wallet_account_id = $1
        order by created_at desc
        offset $2
        limit $3
      `,
      [wallet.id, offset, pageSize]
    ),
    one<{ count: string }>(
      `
        select count(*)::text as count
        from merchant_wallet_logs
        where merchant_wallet_account_id = $1
      `,
      [wallet.id]
    )
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      walletAccountId: item.merchant_wallet_account_id,
      type: item.type,
      source: item.source,
      amount: toNumber(item.amount),
      balanceBefore: toNumber(item.balance_before),
      balanceAfter: toNumber(item.balance_after),
      referenceType: item.reference_type,
      referenceId: item.reference_id,
      description: item.description,
      createdAt: new Date(item.created_at).toISOString()
    })),
    meta: toMeta(page, pageSize, Number(totalRow?.count ?? 0))
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
    aiKocEnabled?: boolean;
  }
) => {
  const merchant = await getMerchantOrThrow(userId);
  const category = await one<{ id: string; name: string; is_active: boolean }>(
    `select id, name, is_active from categories where id = $1 limit 1`,
    [payload.categoryId]
  );
  if (!category || !category.is_active) {
    throw new AppError('Invalid category', 422);
  }

  const wallet = await getMerchantWalletOrThrow(merchant.id);
  const budget = getMissionBudgetFromPayload(payload);
  const finance = await getFinanceSettings();
  const totalChargeAmount = Number((budget + (budget * finance.platformFeePercent) / 100).toFixed(2));
  const rewardPerCreatorMyr = budget / Math.max(payload.quota, 1);
  const rewardPoints = Math.max(1, Math.round(rewardPerCreatorMyr / Math.max(finance.pointsToMyrRate, 0.01)));

  return transaction(async (client) => {
    const mission = await one<MissionRow>(
      `
        insert into missions (
          merchant_id,
          category_id,
          title,
          description,
          requirement,
          proof_requirement,
          location,
          reward_points,
          budget_amount,
          max_creators,
          joined_count,
          start_date,
          end_date
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, now(), $11)
        returning *
      `,
      [
        merchant.id,
        payload.categoryId,
        payload.title,
        payload.description,
        stringifyChecklist(payload.platformRequirements),
        stringifyChecklist(payload.deliverablesChecklist),
        payload.location ?? null,
        rewardPoints,
        budget,
        payload.quota,
        payload.deadline
      ],
      client
    );

    if (!mission) throw new AppError('Failed to create mission', 500);

    await writeWalletLog(
      client,
      wallet,
      'DEBIT',
      'MISSION_PAYMENT',
      totalChargeAmount,
      'missions',
      mission.id,
      `Mission budget reserved for ${mission.title}`
    );

    return serializeMission({ ...mission, category_name: category.name });
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
  const merchant = await getMerchantOrThrow(userId);
  const current = await one<MissionRow>(
    `select * from missions where id = $1 and merchant_id = $2 limit 1`,
    [missionId, merchant.id]
  );
  if (!current) throw new AppError('Mission not found', 404);

  const category = await one<{ id: string; name: string; is_active: boolean }>(
    `select id, name, is_active from categories where id = $1 limit 1`,
    [payload.categoryId]
  );
  if (!category || !category.is_active) throw new AppError('Invalid category', 422);

  const budget = getMissionBudgetFromPayload(payload);
  const finance = await getFinanceSettings();
  const oldTotal = Number((toNumber(current.budget_amount) + (toNumber(current.budget_amount) * finance.platformFeePercent) / 100).toFixed(2));
  const newTotal = Number((budget + (budget * finance.platformFeePercent) / 100).toFixed(2));
  const delta = Number((newTotal - oldTotal).toFixed(2));
  const wallet = await getMerchantWalletOrThrow(merchant.id);
  const rewardPerCreatorMyr = budget / Math.max(payload.quota, 1);
  const rewardPoints = Math.max(1, Math.round(rewardPerCreatorMyr / Math.max(finance.pointsToMyrRate, 0.01)));

  return transaction(async (client) => {
    if (delta > 0) {
      await writeWalletLog(client, wallet, 'DEBIT', 'MISSION_PAYMENT', delta, 'missions', missionId, `Mission budget increase for ${payload.title}`);
    } else if (delta < 0) {
      await writeWalletLog(client, wallet, 'CREDIT', 'REFUND', Math.abs(delta), 'missions', missionId, `Mission budget adjustment for ${payload.title}`);
    }

    const mission = await one<MissionRow>(
      `
        update missions
        set
          category_id = $3,
          title = $4,
          description = $5,
          requirement = $6,
          proof_requirement = $7,
          location = $8,
          reward_points = $9,
          budget_amount = $10,
          max_creators = $11,
          end_date = $12,
          updated_at = now()
        where id = $1 and merchant_id = $2
        returning *
      `,
      [
        missionId,
        merchant.id,
        payload.categoryId,
        payload.title,
        payload.description,
        stringifyChecklist(payload.platformRequirements),
        stringifyChecklist(payload.deliverablesChecklist),
        payload.location ?? null,
        rewardPoints,
        budget,
        payload.quota,
        payload.deadline
      ],
      client
    );

    if (!mission) throw new AppError('Mission not found', 404);
    return serializeMission({ ...mission, category_name: category.name });
  });
};

export const deleteMission = async (userId: string, missionId: string) => {
  const merchant = await getMerchantOrThrow(userId);
  const current = await one<MissionRow>(
    `select * from missions where id = $1 and merchant_id = $2 limit 1`,
    [missionId, merchant.id]
  );
  if (!current) throw new AppError('Mission not found', 404);
  if (current.joined_count > 0) throw new AppError('Mission with participants cannot be deleted', 422);

  const finance = await getFinanceSettings();
  const refund = Number((toNumber(current.budget_amount) + (toNumber(current.budget_amount) * finance.platformFeePercent) / 100).toFixed(2));
  const wallet = await getMerchantWalletOrThrow(merchant.id);

  return transaction(async (client) => {
    await one(`delete from missions where id = $1 and merchant_id = $2 returning id`, [missionId, merchant.id], client);
    await writeWalletLog(client, wallet, 'CREDIT', 'REFUND', refund, 'missions', missionId, `Mission refund for ${current.title}`);
    return { deleted: true };
  });
};

export const updateMissionStatus = async (userId: string, missionId: string, status: MissionStatus, reason?: string) => {
  const merchant = await getMerchantOrThrow(userId);
  if (status === 'COMPLETED' || status === 'CANCELLED') {
    const mission = await one<MissionRow>(
      `
        with updated as (
          update missions
          set end_date = now(), updated_at = now()
          where id = $1 and merchant_id = $2
          returning *
        )
        select updated.*, c.name as category_name
        from updated
        left join categories c on c.id = updated.category_id
      `,
      [missionId, merchant.id]
    );
    if (!mission) throw new AppError('Mission not found', 404);
    return { ...serializeMission(mission), status, reason: reason ?? null };
  }

  const mission = await one<MissionRow>(
    `
      select m.*, c.name as category_name
      from missions m
      left join categories c on c.id = m.category_id
      where m.id = $1 and m.merchant_id = $2
      limit 1
    `,
    [missionId, merchant.id]
  );
  if (!mission) throw new AppError('Mission not found', 404);
  return { ...serializeMission(mission), status, reason: reason ?? null };
};

export const listMerchantMissions = async (userId: string, page: number, pageSize: number, status?: MissionStatus) => {
  const merchant = await getMerchantOrThrow(userId);
  const offset = (page - 1) * pageSize;
  const rows = await many<MissionRow>(
    `
      select m.*, c.name as category_name
      from missions m
      left join categories c on c.id = m.category_id
      where m.merchant_id = $1
      order by m.created_at desc
      offset $2
      limit $3
    `,
    [merchant.id, offset, pageSize]
  );
  const items = rows.map(serializeMission).filter((item) => !status || item.status === status);
  const totalRow = await one<{ count: string }>(`select count(*)::text as count from missions where merchant_id = $1`, [merchant.id]);
  return {
    items,
    meta: toMeta(page, pageSize, Number(totalRow?.count ?? items.length))
  };
};

export const getMissionDetail = async (userId: string, missionId: string) => {
  const merchant = await getMerchantOrThrow(userId);
  const row = await one<MissionRow>(
    `
      select m.*, c.name as category_name
      from missions m
      left join categories c on c.id = m.category_id
      where m.id = $1 and m.merchant_id = $2
      limit 1
    `,
    [missionId, merchant.id]
  );
  if (!row) throw new AppError('Mission not found', 404);
  return serializeMission(row);
};

export const listMissionApplicants = async (userId: string, missionId: string) => {
  const merchant = await getMerchantOrThrow(userId);
  const mission = await one<{ id: string }>(`select id from missions where id = $1 and merchant_id = $2 limit 1`, [missionId, merchant.id]);
  if (!mission) throw new AppError('Mission not found', 404);

  const rows = await many<ParticipantRow>(
    `
      select mp.*, u.email, u.display_name, u.avatar_url, u.follower_count, u.verification_status, u.instagram_url, u.tiktok_url, u.bio
      from mission_participants mp
      join users u on u.id = mp.user_id
      where mp.mission_id = $1
      order by mp.joined_at desc
    `,
    [missionId]
  );

  return rows.map(serializeParticipant);
};

export const decideMissionApplication = async (userId: string, applicationId: string, status: 'ACCEPTED' | 'REJECTED') => {
  const merchant = await getMerchantOrThrow(userId);
  const participant = await one<ParticipantRow & { merchant_id: string }>(
    `
      select mp.*, m.merchant_id
      from mission_participants mp
      join missions m on m.id = mp.mission_id
      where mp.id = $1 and m.merchant_id = $2
      limit 1
    `,
    [applicationId, merchant.id]
  );
  if (!participant) throw new AppError('Application not found', 404);

  if (status === 'REJECTED') {
    await transaction(async (client) => {
      await one(`delete from mission_participants where id = $1 returning id`, [applicationId], client);
      await one(
        `update missions set joined_count = greatest(joined_count - 1, 0), updated_at = now() where id = $1 returning id`,
        [participant.mission_id],
        client
      );
    });
    return { id: applicationId, status: 'REJECTED' };
  }

  return { ...serializeParticipant(participant), status: 'ACCEPTED' };
};

export const listMissionSubmissions = async (userId: string, missionId: string) => {
  const merchant = await getMerchantOrThrow(userId);
  const mission = await one<{ id: string }>(`select id from missions where id = $1 and merchant_id = $2 limit 1`, [missionId, merchant.id]);
  if (!mission) throw new AppError('Mission not found', 404);

  const rows = await many<ParticipantRow>(
    `
      select mp.*, u.email, u.display_name, u.avatar_url, u.follower_count, u.verification_status, u.instagram_url, u.tiktok_url, u.bio
      from mission_participants mp
      join users u on u.id = mp.user_id
      where mp.mission_id = $1 and mp.submitted_at is not null
      order by mp.submitted_at desc
    `,
    [missionId]
  );

  return rows.map(serializeParticipant);
};

export const reviewSubmission = async (
  userId: string,
  submissionId: string,
  status: 'APPROVED' | 'REJECTED' | 'RESUBMIT_REQUIRED',
  reviewNote?: string
) => {
  const merchant = await getMerchantOrThrow(userId);
  const participant = await one<ParticipantRow & { merchant_id: string }>(
    `
      select mp.*, m.merchant_id
      from mission_participants mp
      join missions m on m.id = mp.mission_id
      where mp.id = $1 and m.merchant_id = $2
      limit 1
    `,
    [submissionId, merchant.id]
  );
  if (!participant) throw new AppError('Submission not found', 404);

  if (status === 'APPROVED') {
    const updated = await one<ParticipantRow>(
      `
        update mission_participants
        set
          rewarded_at = coalesce(rewarded_at, now()),
          submission_note = $2,
          updated_at = now()
        where id = $1
        returning *
      `,
      [submissionId, reviewNote ?? participant.submission_note]
    );
    if (!updated) throw new AppError('Submission not found', 404);
    return { ...serializeParticipant(updated), submission: { status: 'APPROVED' } };
  }

  const updated = await one<ParticipantRow>(
    `
      update mission_participants
      set submission_note = $2, updated_at = now()
      where id = $1
      returning *
    `,
    [submissionId, reviewNote ?? participant.submission_note]
  );
  if (!updated) throw new AppError('Submission not found', 404);
  return { ...serializeParticipant(updated), submission: { status } };
};

export const createMissionReview = async (
  _userId: string,
  _payload: { missionId: string; submissionId: string; influencerId: string; star: number; comment: string }
) => {
  throw new AppError('Reviews are not supported by the current database schema', 501);
};

export const listMerchantNotifications = async (_userId: string, page: number, pageSize: number) => ({
  items: [],
  meta: toMeta(page, pageSize, 0)
});

export const openMerchantDispute = async (_userId: string, _payload: { applicationId: string; reason: string; details: string }) => {
  throw new AppError('Disputes are not supported by the current database schema', 501);
};

export const listMerchantProducts = async (userId: string) => listMerchantProductsRecord(userId);

export const getMerchantProduct = async (userId: string, productId: string) => getMerchantProductRecord(userId, productId);

export const createMerchantProduct = async (
  userId: string,
  payload: {
    name: string;
    description?: string;
    imageUrl?: string | null;
    imageUrls?: string[];
    price: number;
    stock: number;
    status?: string;
  }
) => createMerchantProductRecord(userId, payload);

export const updateMerchantProduct = async (
  userId: string,
  productId: string,
  payload: {
    name: string;
    description?: string;
    imageUrl?: string | null;
    imageUrls?: string[];
    price: number;
    stock: number;
    status?: string;
  }
) => updateMerchantProductRecord(userId, productId, payload);

export const deleteMerchantProduct = async (userId: string, productId: string) => deleteMerchantProductRecord(userId, productId);

export const getMerchantVoucherByCode = async (userId: string, code: string) => getMerchantVoucherByCodeRecord(userId, code);

export const redeemMerchantVoucher = async (userId: string, code: string) => redeemMerchantVoucherRecord(userId, code);
