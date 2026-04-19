import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/app-error';
import { hashValue, verifyHash } from '../utils/hash';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sha256 } from '../utils/token';
import { durationToMs } from '../utils/time';
import { env } from '../config/env';

export type RegisterPayload = {
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

const withProfiles = {
  merchantProfile: true,
  influencerProfile: true
} as const;

const issueTokens = async (user: { id: string; role: Role; email: string }) => {
  const payload = { id: user.id, role: user.role, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const expiresAt = new Date(Date.now() + durationToMs(env.REFRESH_TOKEN_TTL));

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt
    }
  });

  return { accessToken, refreshToken };
};

export const register = async (payload: RegisterPayload) => {
  const exists = await prisma.user.findUnique({ where: { email: payload.email } });
  if (exists) {
    throw new AppError('Email already registered', 409);
  }

  const passwordHash = await hashValue(payload.password);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        role: payload.role,
        email: payload.email,
        passwordHash
      }
    });

    if (payload.role === Role.MERCHANT) {
      const merchantProfile = await tx.merchantProfile.create({
        data: {
          userId: created.id,
          companyName: payload.companyName ?? `Company ${created.id.slice(0, 6)}`,
          contactPerson: payload.contactPerson ?? 'Contact Person',
          phone: payload.phone ?? '000000000',
          email: payload.email,
          address: 'Not set'
        }
      });
      await tx.merchantWalletAccount.create({
        data: {
          merchantId: merchantProfile.id
        }
      });
    }

    if (payload.role === Role.INFLUENCER) {
      const influencerProfile = await tx.influencerProfile.create({
        data: {
          userId: created.id,
          igLink: payload.igLink ?? 'https://instagram.com/placeholder',
          tiktokLink: payload.tiktokLink,
          followerCount: payload.followerCount ?? 0,
          proofImageUrl: '',
          phone: payload.phone ?? '000000000'
        }
      });
      await tx.pointsAccount.create({
        data: {
          influencerId: influencerProfile.id
        }
      });
    }

    return tx.user.findUniqueOrThrow({ where: { id: created.id }, include: withProfiles });
  });

  const tokens = await issueTokens(user);
  return {
    tokens,
    user
  };
};

export const login = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email }, include: withProfiles });
  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError('Account is not active', 403);
  }

  const valid = await verifyHash(password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401);
  }

  const tokens = await issueTokens(user);
  return { tokens, user };
};

export const refreshSession = async (refreshToken: string) => {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = sha256(refreshToken);

  const tokenRow = await prisma.refreshToken.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      userId: payload.id
    }
  });

  if (!tokenRow) {
    throw new AppError('Invalid refresh token', 401);
  }

  await prisma.refreshToken.update({ where: { id: tokenRow.id }, data: { revokedAt: new Date() } });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.id }, include: withProfiles });
  if (user.status !== 'ACTIVE') {
    throw new AppError('Account is not active', 403);
  }

  const tokens = await issueTokens(user);
  return { tokens, user };
};

export const logout = async (refreshToken?: string) => {
  if (!refreshToken) return;
  const tokenHash = sha256(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
};