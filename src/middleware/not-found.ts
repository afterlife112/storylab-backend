import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/app-error';

export const notFound = (_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('Route not found', 404));
};