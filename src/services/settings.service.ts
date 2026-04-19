import { prisma } from '../lib/prisma';
import { DEFAULT_SETTINGS } from '../constants/settings';

export const ensureDefaultSettings = async () => {
  await Promise.all(
    Object.entries(DEFAULT_SETTINGS).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: {},
        create: { key, value }
      })
    )
  );
};

export const getFinanceSettings = async () => {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((row) => [row.key, row.value]));

  return {
    platformFeePercent: Number(map.get('PLATFORM_FEE_PERCENT') ?? 10),
    pointsToMyrRate: Number(map.get('POINTS_TO_MYR_RATE') ?? 0.01),
    minWithdrawalMyr: Number(map.get('MIN_WITHDRAWAL_MYR') ?? 50)
  };
};

export const updateFinanceSettings = async (payload: {
  platformFeePercent: number;
  pointsToMyrRate: number;
  minWithdrawalMyr: number;
}) => {
  await prisma.$transaction([
    prisma.setting.upsert({ where: { key: 'PLATFORM_FEE_PERCENT' }, update: { value: String(payload.platformFeePercent) }, create: { key: 'PLATFORM_FEE_PERCENT', value: String(payload.platformFeePercent) } }),
    prisma.setting.upsert({ where: { key: 'POINTS_TO_MYR_RATE' }, update: { value: String(payload.pointsToMyrRate) }, create: { key: 'POINTS_TO_MYR_RATE', value: String(payload.pointsToMyrRate) } }),
    prisma.setting.upsert({ where: { key: 'MIN_WITHDRAWAL_MYR' }, update: { value: String(payload.minWithdrawalMyr) }, create: { key: 'MIN_WITHDRAWAL_MYR', value: String(payload.minWithdrawalMyr) } })
  ]);

  return getFinanceSettings();
};