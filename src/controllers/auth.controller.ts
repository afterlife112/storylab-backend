import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/app-error';
import * as authService from '../services/auth.service';
import { AuthedRequest } from '../types';

const getCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/'
});

const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(env.REFRESH_COOKIE_NAME, token, {
    ...getCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
};

export const register = async (req: Request, res: Response) => {
  const result = await authService.register(req.body);
  setRefreshCookie(res, result.tokens.refreshToken);
  return sendSuccess(
    res,
    {
      accessToken: result.tokens.accessToken,
      user: result.user
    },
    201
  );
};

export const login = async (req: Request, res: Response) => {
  const result = await authService.login(req.body.email, req.body.password);
  setRefreshCookie(res, result.tokens.refreshToken);
  return sendSuccess(res, {
    accessToken: result.tokens.accessToken,
    user: result.user
  });
};

export const refresh = async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (!refreshToken) throw new AppError('Refresh token missing', 401);

  const result = await authService.refreshSession(refreshToken);
  setRefreshCookie(res, result.tokens.refreshToken);

  return sendSuccess(res, {
    accessToken: result.tokens.accessToken,
    user: result.user
  });
};

export const logout = async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  await authService.logout(refreshToken);
  res.clearCookie(env.REFRESH_COOKIE_NAME, getCookieOptions());
  return sendSuccess(res, { loggedOut: true });
};

export const me = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      merchantProfile: true,
      influencerProfile: true
    }
  });

  if (!user) throw new AppError('User not found', 404);

  return sendSuccess(res, user);
};