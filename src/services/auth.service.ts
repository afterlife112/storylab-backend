import { one } from '../database/query';
import { transaction } from '../database/transaction';
import { NotificationTypes, Role, Roles } from '../constants/enums';
import { AppError } from '../utils/app-error';
import { hashValue, verifyHash } from '../utils/hash';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sha256 } from '../utils/token';
import { durationToMs } from '../utils/time';
import { env } from '../config/env';

type RegisterPayload = {
  role: Role;
  email: string;
  password: string;
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  igLink?: string;
  tiktokLink?: string;
  followerCount?: number;
};

type AdminRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  status: string;
};

type MerchantRow = {
  id: string;
  email: string;
  password_hash: string;
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
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
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
};

type AuthActor =
  | { id: string; role: 'ADMIN'; email: string; status: string; fullName: string; avatarUrl: string | null; adminRole: string }
  | {
      id: string;
      role: 'MERCHANT';
      email: string;
      status: string;
      merchantProfile: {
        id: string;
        userId: string;
        companyName: string;
        contactPerson: string;
        phone: string;
        email: string;
        address: string;
        logoUrl: string | null;
        socials: {
          website?: string | null;
          facebook?: string | null;
          instagram?: string | null;
          tiktok?: string | null;
        };
      };
    }
  | {
      id: string;
      role: 'INFLUENCER';
      email: string;
      status: 'ACTIVE';
      displayName: string;
      avatarUrl: string | null;
      bio: string | null;
      influencerProfile: {
        id: string;
        igLink: string;
        tiktokLink?: string | null;
        followerCount: number;
        verificationStatus: 'UNVERIFIED' | 'PENDING' | 'APPROVED' | 'REJECTED';
        verificationNotes?: string | null;
        proofImageUrl: string;
        phone: string;
        phoneVerifiedAt?: string | null;
      };
    };

const displayNameFromEmail = (email: string) =>
  email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'StoryLab User';

const mapVerificationStatus = (status: string) => {
  if (status === 'VERIFIED') return 'APPROVED';
  if (status === 'REJECTED') return 'REJECTED';
  if (status === 'PENDING') return 'PENDING';
  return 'UNVERIFIED';
};

const serializeAdmin = (row: AdminRow): AuthActor => ({
  id: row.id,
  role: 'ADMIN',
  email: row.email,
  status: row.status,
  fullName: row.full_name,
  avatarUrl: row.avatar_url,
  adminRole: row.role
});

const serializeMerchant = (row: MerchantRow): AuthActor => ({
  id: row.id,
  role: 'MERCHANT',
  email: row.email,
  status: row.status,
  merchantProfile: {
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
    }
  }
});

const serializeInfluencer = (row: UserRow): AuthActor => ({
  id: row.id,
  role: 'INFLUENCER',
  email: row.email,
  status: 'ACTIVE',
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  bio: row.bio,
  influencerProfile: {
    id: row.id,
    igLink: row.instagram_url ?? '',
    tiktokLink: row.tiktok_url,
    followerCount: row.follower_count,
    verificationStatus: mapVerificationStatus(row.verification_status),
    verificationNotes: null,
    proofImageUrl: row.proof_image_url ?? '',
    phone: row.phone ?? '',
    phoneVerifiedAt: null
  }
});

const getRefreshTokenTable = (role: Role) => {
  if (role === Roles.ADMIN) return 'admin_refresh_tokens';
  if (role === Roles.MERCHANT) return 'merchant_refresh_tokens';
  return 'user_refresh_tokens';
};

const getRefreshTokenOwnerColumn = (role: Role) => {
  if (role === Roles.ADMIN) return 'admin_id';
  if (role === Roles.MERCHANT) return 'merchant_id';
  return 'user_id';
};

const getAdminByEmail = (email: string) =>
  one<AdminRow>(
    `
      select id, email, password_hash, full_name, avatar_url, role, status
      from admins
      where lower(email) = lower($1)
      limit 1
    `,
    [email]
  );

const getMerchantByEmail = (email: string) =>
  one<MerchantRow>(
    `
      select
        id,
        email,
        password_hash,
        company_name,
        contact_person,
        phone,
        address,
        logo_url,
        website_url,
        facebook_url,
        instagram_url,
        tiktok_url,
        status
      from merchants
      where lower(email) = lower($1)
      limit 1
    `,
    [email]
  );

const getInfluencerByEmail = (email: string) =>
  one<UserRow>(
    `
      select
        id,
        email,
        password_hash,
        phone,
        display_name,
        avatar_url,
        bio,
        instagram_url,
        tiktok_url,
        youtube_url,
        follower_count,
        verification_status,
        proof_image_url
      from users
      where lower(email) = lower($1)
      limit 1
    `,
    [email]
  );

export const getActorByRoleAndId = async (role: Role, id: string): Promise<AuthActor | null> => {
  if (role === Roles.ADMIN) {
    const row = await one<AdminRow>(
      `
        select id, email, password_hash, full_name, avatar_url, role, status
        from admins
        where id = $1
        limit 1
      `,
      [id]
    );
    return row ? serializeAdmin(row) : null;
  }

  if (role === Roles.MERCHANT) {
    const row = await one<MerchantRow>(
      `
        select
          id,
          email,
          password_hash,
          company_name,
          contact_person,
          phone,
          address,
          logo_url,
          website_url,
          facebook_url,
          instagram_url,
          tiktok_url,
          status
        from merchants
        where id = $1
        limit 1
      `,
      [id]
    );
    return row ? serializeMerchant(row) : null;
  }

  const row = await one<UserRow>(
    `
      select
        id,
        email,
        password_hash,
        phone,
        display_name,
        avatar_url,
        bio,
        instagram_url,
        tiktok_url,
        youtube_url,
        follower_count,
        verification_status,
        proof_image_url
      from users
      where id = $1
      limit 1
    `,
    [id]
  );

  return row ? serializeInfluencer(row) : null;
};

const issueTokens = async (user: { id: string; role: Role; email: string }) => {
  const payload = { id: user.id, role: user.role, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const expiresAt = new Date(Date.now() + durationToMs(env.REFRESH_TOKEN_TTL));
  const tokenTable = getRefreshTokenTable(user.role);
  const ownerColumn = getRefreshTokenOwnerColumn(user.role);

  await one(
    `
      insert into ${tokenTable} (${ownerColumn}, token_hash, expires_at)
      values ($1, $2, $3)
      returning id
    `,
    [user.id, sha256(refreshToken), expiresAt]
  );

  return { accessToken, refreshToken };
};

const assertActive = (user: AuthActor) => {
  if (user.role !== Roles.INFLUENCER && user.status !== 'ACTIVE') {
    throw new AppError('Account is not active', 403);
  }
};

export const register = async (payload: RegisterPayload) => {
  if (payload.role === Roles.ADMIN) {
    throw new AppError('Admin cannot self-register', 403);
  }

  const [adminExists, merchantExists, userExists] = await Promise.all([
    getAdminByEmail(payload.email),
    getMerchantByEmail(payload.email),
    getInfluencerByEmail(payload.email)
  ]);

  if (adminExists || merchantExists || userExists) {
    throw new AppError('Email already registered', 409);
  }

  const passwordHash = await hashValue(payload.password);
  let onboardingBonus:
    | {
        granted: boolean;
        amountMyr: number;
        points: number;
        qualifyingSpot: number | null;
        qualifyingLimit: number;
      }
    | undefined;

  const user = await transaction<AuthActor>(async (client) => {
    if (payload.role === Roles.MERCHANT) {
      const merchant = await one<MerchantRow>(
        `
          insert into merchants (
            email,
            password_hash,
            company_name,
            contact_person,
            phone,
            address,
            status
          )
          values ($1, $2, $3, $4, $5, $6, 'ACTIVE')
          returning
            id,
            email,
            password_hash,
            company_name,
            contact_person,
            phone,
            address,
            logo_url,
            website_url,
            facebook_url,
            instagram_url,
            tiktok_url,
            status
        `,
        [
          payload.email,
          passwordHash,
          payload.companyName?.trim() || '',
          payload.contactPerson?.trim() || '',
          payload.phone?.trim() || '',
          ''
        ],
        client
      );

      if (!merchant) {
        throw new AppError('Failed to create merchant', 500);
      }

      await one(
        `
          insert into merchant_wallet_accounts (merchant_id, balance, currency)
          values ($1, 0, 'MYR')
          returning id
        `,
        [merchant.id],
        client
      );

      return serializeMerchant(merchant);
    }

    if (!payload.igLink) {
      throw new AppError('Instagram link is required', 422);
    }

    const created = await one<UserRow>(
      `
        insert into users (
          email,
          password_hash,
          phone,
          display_name,
          instagram_url,
          tiktok_url,
          follower_count,
          verification_status,
          proof_image_url
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'UNVERIFIED', '')
        returning
          id,
          email,
          password_hash,
          phone,
          display_name,
          avatar_url,
          bio,
          instagram_url,
          tiktok_url,
          youtube_url,
          follower_count,
          verification_status,
          proof_image_url
      `,
      [
        payload.email,
        passwordHash,
        payload.phone?.trim() || '',
        displayNameFromEmail(payload.email),
        payload.igLink,
        payload.tiktokLink ?? null,
        payload.followerCount ?? 0
      ],
      client
    );

    if (!created) {
      throw new AppError('Failed to create influencer', 500);
    }

    onboardingBonus = {
      granted: false,
      amountMyr: 0,
      points: 0,
      qualifyingSpot: null,
      qualifyingLimit: 0
    };

    return serializeInfluencer(created);
  });

  const tokens = await issueTokens(user);
  return {
    tokens,
    user,
    onboardingBonus
  };
};

export const login = async (email: string, password: string) => {
  const [admin, merchant, influencer] = await Promise.all([
    getAdminByEmail(email),
    getMerchantByEmail(email),
    getInfluencerByEmail(email)
  ]);

  const actor = admin
    ? serializeAdmin(admin)
    : merchant
      ? serializeMerchant(merchant)
      : influencer
        ? serializeInfluencer(influencer)
        : null;

  const passwordHash = admin?.password_hash ?? merchant?.password_hash ?? influencer?.password_hash;

  if (!actor || !passwordHash) {
    throw new AppError('Invalid credentials', 401);
  }

  const valid = await verifyHash(password, passwordHash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401);
  }

  assertActive(actor);

  const tokens = await issueTokens(actor);
  return { tokens, user: actor };
};

export const refreshSession = async (refreshToken: string) => {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = sha256(refreshToken);
  const tokenTable = getRefreshTokenTable(payload.role);
  const ownerColumn = getRefreshTokenOwnerColumn(payload.role);

  const tokenRow = await one<{ id: string }>(
    `
      select id
      from ${tokenTable}
      where token_hash = $1
        and revoked_at is null
        and expires_at > now()
        and ${ownerColumn} = $2
      limit 1
    `,
    [tokenHash, payload.id]
  );

  if (!tokenRow) {
    throw new AppError('Invalid refresh token', 401);
  }

  await one(
    `
      update ${tokenTable}
      set revoked_at = now()
      where id = $1
      returning id
    `,
    [tokenRow.id]
  );

  const user = await getActorByRoleAndId(payload.role, payload.id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  assertActive(user);

  const tokens = await issueTokens(user);
  return { tokens, user };
};

export const logout = async (refreshToken?: string) => {
  if (!refreshToken) return;

  const payload = verifyRefreshToken(refreshToken);
  const tokenTable = getRefreshTokenTable(payload.role);
  const tokenHash = sha256(refreshToken);

  await one(
    `
      update ${tokenTable}
      set revoked_at = now()
      where token_hash = $1
        and revoked_at is null
      returning id
    `,
    [tokenHash]
  );
};
