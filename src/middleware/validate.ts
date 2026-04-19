import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';
import { AppError } from '../utils/app-error';

export const validate = (schema: ZodTypeAny, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return next(new AppError('Validation failed', 422, parsed.error.flatten()));
    }
    (req as any)[source] = parsed.data;
    return next();
  };
};