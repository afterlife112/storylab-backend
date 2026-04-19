import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { revenueMonsterAdapter } from '../adapters/revenue-monster.adapter';
import { AppError } from '../utils/app-error';

export const createTopupIntent = async (merchantProfileId: string, amount: number) => {
  const intent = await revenueMonsterAdapter.createTopupIntent(amount, merchantProfileId);

  await prisma.revenueTopupIntent.create({
    data: {
      referenceId: intent.referenceId,
      merchantId: merchantProfileId,
      amount: new Prisma.Decimal(amount),
      paymentUrl: intent.paymentUrl,
      providerPayload: intent.providerPayload as any
    }
  });

  return intent;
};

export const applyTopupPayment = async (referenceId: string, providedAmount?: number) => {
  const intent = await prisma.revenueTopupIntent.findUnique({ where: { referenceId } });
  if (!intent) {
    throw new AppError('Topup reference not found', 404);
  }

  if (intent.status === 'PAID') {
    return { alreadyProcessed: true, intent };
  }

  const amount = providedAmount ?? Number(intent.amount);
  if (amount <= 0) {
    throw new AppError('Invalid topup amount', 422);
  }

  await prisma.$transaction(async (tx) => {
    await tx.revenueTopupIntent.update({
      where: { referenceId },
      data: {
        status: 'PAID'
      }
    });

    const wallet = await tx.merchantWalletAccount.findUnique({ where: { merchantId: intent.merchantId } });
    if (!wallet) {
      throw new AppError('Wallet account missing', 404);
    }

    await tx.merchantWalletAccount.update({
      where: { id: wallet.id },
      data: {
        balance: {
          increment: amount
        }
      }
    });

    await tx.merchantWalletLedger.create({
      data: {
        walletAccountId: wallet.id,
        amount,
        direction: 'CREDIT',
        type: 'TOPUP',
        reference: referenceId,
        notes: 'Revenue Monster topup'
      }
    });
  });

  return { alreadyProcessed: false };
};

export const verifyRevenueWebhook = (rawBody: string, signature?: string) => {
  return revenueMonsterAdapter.verifyWebhookSignature(rawBody, signature);
};