import crypto from 'node:crypto';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';

export type TopupIntent = {
  paymentUrl: string;
  referenceId: string;
  providerPayload: Record<string, unknown>;
};

export interface RevenueMonsterAdapter {
  createTopupIntent(amount: number, merchantId: string): Promise<TopupIntent>;
  verifyWebhookSignature(rawBody: string, signature?: string): boolean;
}

class RevenueMonsterNotConfiguredAdapter implements RevenueMonsterAdapter {
  async createTopupIntent(): Promise<TopupIntent> {
    throw new AppError('Revenue Monster adapter is not configured', 501, {
      code: 'REVENUE_MONSTER_NOT_CONFIGURED'
    });
  }

  verifyWebhookSignature(rawBody: string, signature?: string): boolean {
    if (!signature) return false;
    const expected = crypto
      .createHmac('sha256', env.REVENUE_MONSTER_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    return expected === signature;
  }
}

export const revenueMonsterAdapter: RevenueMonsterAdapter = new RevenueMonsterNotConfiguredAdapter();
