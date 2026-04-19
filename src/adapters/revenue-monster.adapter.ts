import crypto from 'node:crypto';
import { env } from '../config/env';

export type TopupIntent = {
  paymentUrl: string;
  referenceId: string;
  providerPayload: Record<string, unknown>;
};

export interface RevenueMonsterAdapter {
  createTopupIntent(amount: number, merchantId: string): Promise<TopupIntent>;
  verifyWebhookSignature(rawBody: string, signature?: string): boolean;
}

export class MockRevenueMonsterAdapter implements RevenueMonsterAdapter {
  async createTopupIntent(amount: number, merchantId: string): Promise<TopupIntent> {
    const referenceId = `RM-${merchantId.slice(0, 6)}-${Date.now()}`;
    return {
      referenceId,
      paymentUrl: `${env.APP_BASE_URL}/dev/mock-pay/${referenceId}`,
      providerPayload: {
        provider: 'MOCK_REVENUE_MONSTER',
        amount,
        merchantId
      }
    };
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

export const revenueMonsterAdapter: RevenueMonsterAdapter = new MockRevenueMonsterAdapter();