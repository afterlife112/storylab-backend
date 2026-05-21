import { many, sql } from '../database/query';
import { transaction } from '../database/transaction';
import { AppError } from '../utils/app-error';
import { FIRST_KOC_ONBOARDING_BONUS_MYR, FIRST_KOC_ONBOARDING_LIMIT } from '../constants/mission-catalog';

type SystemSettingRow = {
  key: string;
  value: string;
};

const readSystemSettings = async (): Promise<SystemSettingRow[]> =>
  many<SystemSettingRow>(`
    select key, value
    from system_settings
  `);

export const getFinanceSettings = async () => {
  const rows = await readSystemSettings();
  const map = new Map(rows.map((row) => [row.key, row.value]));

  const platformFeePercent = map.get('platform_fee_percent');
  const pointsToMyrRate = map.get('points_to_myr_rate');
  const minWithdrawalPoints = map.get('min_withdrawal_points');

  if (!platformFeePercent || !pointsToMyrRate || !minWithdrawalPoints) {
    throw new AppError('Required finance settings are missing from the database', 500, {
      code: 'MISSING_SYSTEM_SETTINGS'
    });
  }

  const pointsRate = Number(pointsToMyrRate);
  const minimumPoints = Number(minWithdrawalPoints);
  const minWithdrawalMyr = Number((minimumPoints * pointsRate).toFixed(2));

  return {
    platformFeePercent: Number(platformFeePercent),
    pointsToMyrRate: pointsRate,
    minWithdrawalMyr,
    onboardingBonusMyr: FIRST_KOC_ONBOARDING_BONUS_MYR,
    onboardingBonusLimit: FIRST_KOC_ONBOARDING_LIMIT
  };
};

export const updateFinanceSettings = async (payload: {
  platformFeePercent: number;
  pointsToMyrRate: number;
  minWithdrawalMyr: number;
}) => {
  const minWithdrawalPoints = Math.max(1, Math.round(payload.minWithdrawalMyr / Math.max(payload.pointsToMyrRate, 0.0001)));

  await transaction(async (client) => {
    await sql(
      `
        update system_settings
        set value = $1, updated_at = now()
        where key = 'platform_fee_percent'
      `,
      [String(payload.platformFeePercent)],
      client
    );
    await sql(
      `
        update system_settings
        set value = $1, updated_at = now()
        where key = 'points_to_myr_rate'
      `,
      [String(payload.pointsToMyrRate)],
      client
    );
    await sql(
      `
        update system_settings
        set value = $1, updated_at = now()
        where key = 'min_withdrawal_points'
      `,
      [String(minWithdrawalPoints)],
      client
    );
  });

  return getFinanceSettings();
};
