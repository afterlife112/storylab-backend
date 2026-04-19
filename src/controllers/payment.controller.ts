import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/app-error';
import { applyTopupPayment, verifyRevenueWebhook } from '../services/payment.service';
import { env } from '../config/env';

export const revenueMonsterWebhook = async (req: Request, res: Response) => {
  const signature = req.headers['x-signature'] as string | undefined;
  const rawBody = (req as any).rawBody ?? JSON.stringify(req.body ?? {});

  if (!env.MOCK_REVENUE_MONSTER && !verifyRevenueWebhook(rawBody, signature)) {
    throw new AppError('Invalid webhook signature', 401);
  }

  const referenceId = req.body?.referenceId;
  const amount = req.body?.amount ? Number(req.body.amount) : undefined;
  if (!referenceId) {
    throw new AppError('referenceId is required', 422);
  }

  const result = await applyTopupPayment(referenceId, amount);
  return sendSuccess(res, result);
};

export const mockPay = async (req: Request, res: Response) => {
  if (!env.MOCK_REVENUE_MONSTER) {
    throw new AppError('Mock payment mode disabled', 403);
  }

  const referenceId = String(req.params.referenceId);
  await applyTopupPayment(referenceId);
  return res.send(`<html><body><h2>Payment Success</h2><p>Reference: ${referenceId}</p><a href=\"#\">Close this page</a></body></html>`);
};
