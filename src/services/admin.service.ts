import { randomUUID } from 'crypto';
import { many, one } from '../database/query';
import { transaction } from '../database/transaction';
import { AccountStatus, MissionStatus, VerificationStatus, WithdrawalStatus } from '../constants/enums';
import { AppError } from '../utils/app-error';
import { toMeta } from '../utils/pagination';
import { getFinanceSettings, updateFinanceSettings } from './settings.service';

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || randomUUID();

const mapVerificationStatus = (value: string): 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNVERIFIED' => {
  if (value === 'VERIFIED') return 'APPROVED';
  if (value === 'REJECTED') return 'REJECTED';
  if (value === 'PENDING') return 'PENDING';
  return 'UNVERIFIED';
};

export const getDashboardMetrics = async () => {
  const [
    totalUsersRows,
    verifiedUsersRows,
    totalMerchantsRows,
    activeMissionsRows,
    pendingWithdrawalsRows,
    pendingVerificationsRows,
    totalOrdersRows
  ] = await Promise.all([
    one<{ count: string }>(`select count(*)::text as count from users`),
    one<{ count: string }>(`select count(*)::text as count from users where verification_status = 'VERIFIED'`),
    one<{ count: string }>(`select count(*)::text as count from merchants`),
    one<{ count: string }>(`select count(*)::text as count from missions where end_date is null or end_date >= now()`),
    one<{ count: string }>(`select count(*)::text as count from user_withdrawals where status = 'PENDING'`),
    one<{ count: string }>(`select count(*)::text as count from users where verification_status = 'PENDING'`),
    one<{ count: string }>(`select count(*)::text as count from orders`)
  ]);

  return {
    totalUsers: Number(totalUsersRows?.count ?? 0),
    verifiedUsers: Number(verifiedUsersRows?.count ?? 0),
    totalMerchants: Number(totalMerchantsRows?.count ?? 0),
    activeMissions: Number(activeMissionsRows?.count ?? 0),
    pendingWithdrawals: Number(pendingWithdrawalsRows?.count ?? 0),
    pendingVerifications: Number(pendingVerificationsRows?.count ?? 0),
    totalOrders: Number(totalOrdersRows?.count ?? 0)
  };
};

export const listCategories = async () => {
  return many<{
    id: string;
    name: string;
    slug: string;
    iconurl: string | null;
    isenabled: boolean;
    sortorder: number;
  }>(
    `
      select
        id,
        name,
        slug,
        icon_url as "iconUrl",
        is_active as "isEnabled",
        sort_order as "sortOrder"
      from categories
      order by sort_order asc, name asc
    `
  );
};

export const createCategory = async (payload: { name: string; sortOrder: number; isEnabled: boolean }) => {
  const row = await one<{
    id: string;
    name: string;
    slug: string;
    iconUrl: string | null;
    isEnabled: boolean;
    sortOrder: number;
  }>(
    `
      insert into categories (id, name, slug, icon_url, is_active, sort_order)
      values ($1, $2, $3, null, $4, $5)
      returning
        id,
        name,
        slug,
        icon_url as "iconUrl",
        is_active as "isEnabled",
        sort_order as "sortOrder"
    `,
    [randomUUID(), payload.name, slugify(payload.name), payload.isEnabled, payload.sortOrder]
  );

  if (!row) throw new AppError('Failed to create category', 500);
  return row;
};

export const updateCategory = async (id: string, payload: { name: string; sortOrder: number; isEnabled: boolean }) => {
  const row = await one<{
    id: string;
    name: string;
    slug: string;
    iconUrl: string | null;
    isEnabled: boolean;
    sortOrder: number;
  }>(
    `
      update categories
      set
        name = $2,
        slug = $3,
        is_active = $4,
        sort_order = $5
      where id = $1
      returning
        id,
        name,
        slug,
        icon_url as "iconUrl",
        is_active as "isEnabled",
        sort_order as "sortOrder"
    `,
    [id, payload.name, slugify(payload.name), payload.isEnabled, payload.sortOrder]
  );

  if (!row) throw new AppError('Category not found', 404);
  return row;
};

export const deleteCategory = async (id: string) => {
  const row = await one<{ id: string }>(`delete from categories where id = $1 returning id`, [id]);
  if (!row) throw new AppError('Category not found', 404);
  return row;
};

export const reorderCategories = async (order: { id: string; sortOrder: number }[]) => {
  await transaction(async (client) => {
    for (const row of order) {
      await one(`update categories set sort_order = $2 where id = $1 returning id`, [row.id, row.sortOrder], client);
    }
  });
  return listCategories();
};

export const listVerifications = async (page: number, pageSize: number, status?: VerificationStatus) => {
  const params: unknown[] = [];
  const filters = [`u.proof_image_url is not null`];
  if (status) {
    const restored = status === 'VERIFIED' ? 'VERIFIED' : status;
    params.push(restored);
    filters.push(`u.verification_status = $${params.length}`);
  }
  const whereClause = filters.join(' and ');
  const offset = (page - 1) * pageSize;

  const [items, totalRow] = await Promise.all([
    many<{
      id: string;
      igLink: string | null;
      tiktokLink: string | null;
      followerCount: number;
      verificationNotes: string | null;
      proofImageUrl: string | null;
      phone: string | null;
      createdAt: string;
      userId: string;
      email: string;
      verificationStatusRaw: string;
    }>(
      `
        select
          u.id,
          u.instagram_url as "igLink",
          u.tiktok_url as "tiktokLink",
          u.follower_count as "followerCount",
          u.bio as "verificationNotes",
          u.proof_image_url as "proofImageUrl",
          u.phone,
          u.created_at::text as "createdAt",
          u.id as "userId",
          u.email,
          u.verification_status as "verificationStatusRaw"
        from users u
        where ${whereClause}
        order by u.created_at desc
        offset $${params.length + 1}
        limit $${params.length + 2}
      `,
      [...params, offset, pageSize]
    ),
    one<{ count: string }>(`select count(*)::text as count from users u where ${whereClause}`, params)
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      igLink: item.igLink,
      tiktokLink: item.tiktokLink,
      followerCount: item.followerCount,
      verificationStatus: mapVerificationStatus(item.verificationStatusRaw),
      verificationNotes: item.verificationNotes,
      proofImageUrl: item.proofImageUrl,
      phone: item.phone,
      createdAt: item.createdAt,
      userId: item.userId,
      user: {
        id: item.userId,
        email: item.email,
        status: 'ACTIVE'
      }
    })),
    meta: toMeta(page, pageSize, Number(totalRow?.count ?? 0))
  };
};

export const decideVerification = async (influencerId: string, status: VerificationStatus, notes: string) => {
  const restored = status === 'VERIFIED' ? 'VERIFIED' : status;
  const row = await one<{
    id: string;
    igLink: string | null;
    tiktokLink: string | null;
    followerCount: number;
    proofImageUrl: string | null;
    phone: string | null;
    createdAt: string;
    userId: string;
    email: string;
    verificationStatusRaw: string;
  }>(
    `
      update users u
      set verification_status = $2, updated_at = now()
      where u.id = $1
      returning
        u.id,
        u.instagram_url as "igLink",
        u.tiktok_url as "tiktokLink",
        u.follower_count as "followerCount",
        u.proof_image_url as "proofImageUrl",
        u.phone,
        u.created_at::text as "createdAt",
        u.id as "userId",
        u.email,
        u.verification_status as "verificationStatusRaw"
    `,
    [influencerId, restored]
  );

  if (!row) throw new AppError('Verification record not found', 404);

  return {
    id: row.id,
    igLink: row.igLink,
    tiktokLink: row.tiktokLink,
    followerCount: row.followerCount,
    verificationStatus: mapVerificationStatus(row.verificationStatusRaw),
    verificationNotes: notes,
    proofImageUrl: row.proofImageUrl,
    phone: row.phone,
    createdAt: row.createdAt,
    userId: row.userId,
    user: {
      id: row.userId,
      email: row.email,
      status: 'ACTIVE'
    }
  };
};

export const moderateMission = async (missionId: string, suspended: boolean, reason?: string) => {
  const row = await one<{
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
  }>(
    `
      update missions
      set
        end_date = case when $2 then now() else end_date end,
        description = case when $2 and $3 is not null then concat(coalesce(description, ''), E'\\n\\n[ADMIN NOTE] ', $3) else description end,
        updated_at = now()
      where id = $1
      returning *
    `,
    [missionId, suspended, reason ?? null]
  );

  if (!row) throw new AppError('Mission not found', 404);
  return {
    ...row,
    status: suspended ? 'SUSPENDED' : 'PUBLISHED'
  };
};

export const listUsers = async (page: number, pageSize: number, role?: 'ADMIN' | 'MERCHANT' | 'INFLUENCER', search?: string) => {
  if (role === 'MERCHANT') {
    const params: unknown[] = [];
    const filters = ['1 = 1'];
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      filters.push(`(m.company_name ilike $${i} or m.email ilike $${i} or coalesce(m.phone,'') ilike $${i})`);
    }
    const whereClause = filters.join(' and ');
    const offset = (page - 1) * pageSize;
    const [items, totalRow] = await Promise.all([
      many<{
        id: string;
        fullName: string;
        email: string;
        phoneNumber: string | null;
        companyName: string;
        createdAt: string;
        status: string;
      }>(
        `
          select
            m.id,
            m.contact_person as "fullName",
            m.email,
            m.phone as "phoneNumber",
            m.company_name as "companyName",
            m.created_at::text as "createdAt",
            m.status
          from merchants m
          where ${whereClause}
          order by m.created_at desc
          offset $${params.length + 1}
          limit $${params.length + 2}
        `,
        [...params, offset, pageSize]
      ),
      one<{ count: string }>(`select count(*)::text as count from merchants m where ${whereClause}`, params)
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        fullName: item.fullName ?? item.companyName,
        email: item.email,
        phoneNumber: item.phoneNumber,
        role: 'MERCHANT',
        companyName: item.companyName,
        membershipTier: null,
        pointBalance: 0,
        status: item.status,
        createdAt: item.createdAt,
        dateOfBirth: null,
        gender: null,
        companyCode: null,
        address: null,
        verified: true
      })),
      meta: toMeta(page, pageSize, Number(totalRow?.count ?? 0))
    };
  }

  if (role === 'ADMIN') {
    const params: unknown[] = [];
    const filters = ['1 = 1'];
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      filters.push(`(a.full_name ilike $${i} or a.email ilike $${i})`);
    }
    const whereClause = filters.join(' and ');
    const offset = (page - 1) * pageSize;
    const [items, totalRow] = await Promise.all([
      many<{
        id: string;
        fullName: string;
        email: string;
        createdAt: string;
        status: string;
      }>(
        `
          select id, full_name as "fullName", email, created_at::text as "createdAt", status
          from admins a
          where ${whereClause}
          order by created_at desc
          offset $${params.length + 1}
          limit $${params.length + 2}
        `,
        [...params, offset, pageSize]
      ),
      one<{ count: string }>(`select count(*)::text as count from admins a where ${whereClause}`, params)
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        fullName: item.fullName,
        email: item.email,
        phoneNumber: null,
        role: 'ADMIN',
        companyName: null,
        membershipTier: null,
        pointBalance: 0,
        status: item.status,
        createdAt: item.createdAt,
        dateOfBirth: null,
        gender: null,
        companyCode: null,
        address: null,
        verified: true
      })),
      meta: toMeta(page, pageSize, Number(totalRow?.count ?? 0))
    };
  }

  const params: unknown[] = [];
  const filters = ['1 = 1'];
  if (search) {
    params.push(`%${search}%`);
    const i = params.length;
    filters.push(`(u.display_name ilike $${i} or u.email ilike $${i} or coalesce(u.phone,'') ilike $${i})`);
  }
  const whereClause = filters.join(' and ');
  const offset = (page - 1) * pageSize;
  const [items, totalRow] = await Promise.all([
    many<{
      id: string;
      fullName: string;
      email: string;
      phoneNumber: string | null;
      pointBalance: string;
      createdAt: string;
      verificationStatus: string;
      address: string | null;
    }>(
      `
        select
          u.id,
          u.display_name as "fullName",
          u.email,
          u.phone as "phoneNumber",
          (
            coalesce((select sum(mp.reward_points) from mission_participants mp where mp.user_id = u.id and mp.rewarded_at is not null), 0)
            -
            coalesce((select sum(w.points) from user_withdrawals w where w.user_id = u.id and w.status in ('PENDING','APPROVED','PAID')), 0)
          )::text as "pointBalance",
          u.created_at::text as "createdAt",
          u.verification_status as "verificationStatus",
          u.bio as address
        from users u
        where ${whereClause}
        order by u.created_at desc
        offset $${params.length + 1}
        limit $${params.length + 2}
      `,
      [...params, offset, pageSize]
    ),
    one<{ count: string }>(`select count(*)::text as count from users u where ${whereClause}`, params)
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      fullName: item.fullName,
      email: item.email,
      phoneNumber: item.phoneNumber,
      role: 'USER',
      companyName: null,
      membershipTier: null,
      pointBalance: Number(item.pointBalance),
      status: item.verificationStatus === 'REJECTED' ? 'INACTIVE' : 'ACTIVE',
      createdAt: item.createdAt,
      dateOfBirth: null,
      gender: null,
      companyCode: null,
      address: item.address,
      verified: item.verificationStatus === 'VERIFIED'
    })),
    meta: toMeta(page, pageSize, Number(totalRow?.count ?? 0))
  };
};

export const updateUserStatus = async (userId: string, status: AccountStatus) => {
  const mapped = status === 'BANNED' ? 'REJECTED' : 'PENDING';
  const row = await one<{ id: string }>(
    `
      update users
      set verification_status = $2, updated_at = now()
      where id = $1
      returning id
    `,
    [userId, mapped]
  );
  if (!row) throw new AppError('User not found', 404);
  return row;
};

export const getFinanceConfig = async () => getFinanceSettings();

export const updateFinanceConfig = async (payload: {
  platformFeePercent: number;
  pointsToMyrRate: number;
  minWithdrawalMyr: number;
}) => updateFinanceSettings(payload);

export const listWithdrawalsAdmin = async (page: number, pageSize: number, status?: WithdrawalStatus) => {
  const params: unknown[] = [];
  const filters = ['1 = 1'];
  if (status) {
    params.push(status);
    filters.push(`w.status = $${params.length}`);
  }
  const whereClause = filters.join(' and ');
  const offset = (page - 1) * pageSize;

  const [items, totalRow] = await Promise.all([
    many<{
      id: string;
      userId: string;
      pointsUsed: number;
      myrAmount: number;
      bankName: string | null;
      bankAccountName: string | null;
      bankAccountNo: string | null;
      status: string;
      adminNotes: string | null;
      createdAt: string;
      approvedAt: string | null;
      paidAt: string | null;
      rejectedAt: string | null;
      email: string;
      displayName: string;
    }>(
      `
        select
          w.id,
          w.user_id as "userId",
          w.points as "pointsUsed",
          w.myr_amount as "myrAmount",
          w.bank_name as "bankName",
          w.bank_account_name as "bankAccountName",
          w.bank_account_no as "bankAccountNo",
          w.status::text as status,
          w.admin_note as "adminNotes",
          w.requested_at::text as "createdAt",
          w.approved_at::text as "approvedAt",
          w.paid_at::text as "paidAt",
          w.rejected_at::text as "rejectedAt",
          u.email,
          u.display_name as "displayName"
        from user_withdrawals w
        join users u on u.id = w.user_id
        where ${whereClause}
        order by w.requested_at desc
        offset $${params.length + 1}
        limit $${params.length + 2}
      `,
      [...params, offset, pageSize]
    ),
    one<{ count: string }>(`select count(*)::text as count from user_withdrawals w where ${whereClause}`, params)
  ]);

  return {
    items: items.map((item) => ({
      ...item,
      payoutRef: null,
      influencer: {
        id: item.userId,
        userId: item.userId,
        user: {
          id: item.userId,
          email: item.email,
          displayName: item.displayName
        }
      }
    })),
    meta: toMeta(page, pageSize, Number(totalRow?.count ?? 0))
  };
};

export const updateWithdrawalStatus = async (
  withdrawalId: string,
  payload: {
    status: WithdrawalStatus;
    payoutRef?: string;
    adminNotes?: string;
  }
) => {
  if (payload.status === 'PAID' && !payload.payoutRef) {
    throw new AppError('payoutRef is required when marking as PAID', 422);
  }

  const mergedAdminNote = [payload.adminNotes?.trim(), payload.payoutRef ? `Payout ref: ${payload.payoutRef}` : null]
    .filter(Boolean)
    .join('\n')
    .trim();

  const row = await one<{
    id: string;
    userId: string;
    pointsUsed: number;
    myrAmount: number;
    bankName: string | null;
    bankAccountName: string | null;
    bankAccountNo: string | null;
    status: string;
    adminNotes: string | null;
    createdAt: string;
    approvedAt: string | null;
    paidAt: string | null;
    rejectedAt: string | null;
    email: string;
    displayName: string;
  }>(
    `
      update user_withdrawals w
      set
        status = $2,
        admin_note = $3,
        approved_at = case when $2 = 'APPROVED' and approved_at is null then now() else approved_at end,
        paid_at = case when $2 = 'PAID' and paid_at is null then now() else paid_at end,
        rejected_at = case when $2 = 'REJECTED' and rejected_at is null then now() else rejected_at end
      from users u
      where w.id = $1 and u.id = w.user_id
      returning
        w.id,
        w.user_id as "userId",
        w.points as "pointsUsed",
        w.myr_amount as "myrAmount",
        w.bank_name as "bankName",
        w.bank_account_name as "bankAccountName",
        w.bank_account_no as "bankAccountNo",
        w.status::text as status,
        w.admin_note as "adminNotes",
        w.requested_at::text as "createdAt",
        w.approved_at::text as "approvedAt",
        w.paid_at::text as "paidAt",
        w.rejected_at::text as "rejectedAt",
        u.email,
        u.display_name as "displayName"
    `,
    [withdrawalId, payload.status, mergedAdminNote || null]
  );

  if (!row) throw new AppError('Withdrawal not found', 404);

  return {
    ...row,
    payoutRef: payload.payoutRef ?? null,
    influencer: {
      id: row.userId,
      userId: row.userId,
      user: {
        id: row.userId,
        email: row.email,
        displayName: row.displayName
      }
    }
  };
};

export const listAuditLogs = async (page: number, pageSize: number) => ({
  items: [],
  meta: toMeta(page, pageSize, 0)
});

export const listPointLogs = async () => {
  const missionRows = await many<{
    id: string;
    userName: string;
    amount: number;
    createdAt: string;
    referenceId: string;
    description: string;
  }>(
    `
      select
        mp.id,
        u.display_name as "userName",
        mp.reward_points as amount,
        mp.rewarded_at::text as "createdAt",
        mp.id as "referenceId",
        concat('Reward for ', m.title) as description
      from mission_participants mp
      join users u on u.id = mp.user_id
      join missions m on m.id = mp.mission_id
      where mp.rewarded_at is not null
      order by mp.rewarded_at desc
    `
  );

  return missionRows.map((row) => ({
    id: row.id,
    action: 'user.points.earn',
    userName: row.userName,
    amount: row.amount,
    createdAt: row.createdAt,
    referenceType: 'mission_participants',
    referenceId: row.referenceId,
    description: row.description,
    balanceBefore: 0,
    balanceAfter: 0
  }));
};

export const listDisputes = async (page: number, pageSize: number, _status?: string) => ({
  items: [],
  meta: toMeta(page, pageSize, 0)
});

export const resolveDispute = async (
  _disputeId: string,
  _status: 'RESOLVED' | 'REJECTED',
  _resolutionNote: string,
  _adminId: string
) => {
  throw new AppError('Disputes are not supported by the current database schema', 501);
};
