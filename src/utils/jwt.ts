import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthUser } from '../types';

const accessExpiresIn = env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'];
const refreshExpiresIn = env.REFRESH_TOKEN_TTL as jwt.SignOptions['expiresIn'];

export const signAccessToken = (payload: AuthUser) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: accessExpiresIn });

export const signRefreshToken = (payload: AuthUser) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: refreshExpiresIn });

export const verifyAccessToken = (token: string) => jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser;
export const verifyRefreshToken = (token: string) => jwt.verify(token, env.JWT_REFRESH_SECRET) as AuthUser;
