import { Role } from '@prisma/client';
import { NextFunction, Response } from 'express';
import { AppError } from '../utils/app-error';
import { AuthedRequest } from '../types';

export const requireRole = (roles: Role[]) => (req: AuthedRequest, _res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AppError('Unauthorized', 401));
  }
  if (!roles.includes(req.user.role)) {
    return next(new AppError('Forbidden', 403));
  }
  return next();
};