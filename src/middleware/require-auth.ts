import { NextFunction, Response } from 'express';
import { AppError } from '../utils/app-error';
import { AuthedRequest } from '../types';
import { verifyAccessToken } from '../utils/jwt';

export const requireAuth = (req: AuthedRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', 401));
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    req.user = verifyAccessToken(token);
    return next();
  } catch {
    return next(new AppError('Invalid or expired token', 401));
  }
};