import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/app-error';

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      data: null,
      error: {
        message: err.message,
        details: err.details ?? null
      }
    });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    data: null,
    error: {
      message: 'Internal server error',
      details: null
    }
  });
};