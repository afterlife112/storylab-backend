import { one } from '../database/query';
import { transaction } from '../database/transaction';
import { revenueMonsterAdapter } from '../adapters/revenue-monster.adapter';
import { AppError } from '../utils/app-error';

type TopupIntentRow = {
  id: string;
  merchant_id: string;
  amount: number | string;
  currency: string;
  payment_provider: string | null;
  payment_reference: string | null;
  status: string;
  created_at: Date | string;
  paid_at: Date | string | null;
};

type WalletRow = {
  id: string;
  balance: number | string;
};

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

export const createTopupIntent = async (merchantId: string, amount: number) => {
  const intent = await revenueMonsterAdapter.createTopupIntent(amount, merchantId);

  await one<TopupIntentRow>(
    `
      insert into merchant_topup_intents (
        merchant_id,
        amount,
        currency,
        payment_provider,
        payment_reference,
        status,
        created_at
      )
      values ($1, $2, 'MYR', 'revenue_monster', $3, 'PENDING', now())
      returning *
    `,
    [merchantId, amount, intent.referenceId]
  );

  return intent;
};

export const applyTopupPayment = async (referenceId: string, providedAmount?: number) => {
  const intent = await one<TopupIntentRow>(
    `
      select *
      from merchant_topup_intents
      where payment_reference = $1
      limit 1
    `,
    [referenceId]
  );

  if (!intent) throw new AppError('Topup reference not found', 404);
  if (intent.status === 'PAID') return { alreadyProcessed: true, intent };

  const amount = providedAmount ?? toNumber(intent.amount);
  if (amount <= 0) throw new AppError('Invalid topup amount', 422);

  await transaction(async (client) => {
    await one(
      `
        update merchant_topup_intents
        set status = 'PAID', paid_at = now()
        where id = $1
        returning id
      `,
      [intent.id],
      client
    );

    const wallet = await one<WalletRow>(
      `
        select id, balance
        from merchant_wallet_accounts
        where merchant_id = $1
        limit 1
      `,
      [intent.merchant_id],
      client
    );

    if (!wallet) throw new AppError('Wallet account missing', 404);

    const balanceBefore = toNumber(wallet.balance);
    const balanceAfter = balanceBefore + amount;

    await one(
      `
        update merchant_wallet_accounts
        set balance = $2, updated_at = now()
        where id = $1
        returning id
      `,
      [wallet.id, balanceAfter],
      client
    );

    await one(
      `
        insert into merchant_wallet_logs (
          merchant_wallet_account_id,
          type,
          source,
          amount,
          balance_before,
          balance_after,
          reference_type,
          reference_id,
          description
        )
        values ($1, 'CREDIT', 'TOPUP', $2, $3, $4, 'merchant_topup_intents', $5, 'Revenue Monster topup')
        returning id
      `,
      [wallet.id, amount, balanceBefore, balanceAfter, intent.id],
      client
    );
  });

  return { alreadyProcessed: false };
};

export const verifyRevenueWebhook = (rawBody: string, signature?: string) => {
  return revenueMonsterAdapter.verifyWebhookSignature(rawBody, signature);
};
