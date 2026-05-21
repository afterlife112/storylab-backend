import { AppError } from '../utils/app-error';
import { toMeta } from '../utils/pagination';

export const ensureMerchantLandingForAcceptedApplication = async (_applicationId: string) => {
  throw new AppError('Merchant landing is not supported by the current database schema', 501);
};

export const disableMerchantLandingForApplication = async (_applicationId: string) => {
  return { disabled: false };
};

export const getMerchantLandingForInfluencer = async (_userId: string, _applicationId: string) => {
  throw new AppError('Merchant landing is not supported by the current database schema', 501);
};

export const generateMerchantCheckInQr = async (_userId: string, _applicationId: string) => {
  throw new AppError('Merchant check-in is not supported by the current database schema', 501);
};

export const listInfluencerCheckInRecords = async (_userId: string, page: number, pageSize: number) => ({
  items: [],
  meta: toMeta(page, pageSize, 0)
});

export const getMerchantLandingBySlug = async (_slug: string) => {
  throw new AppError('Merchant landing is not supported by the current database schema', 501);
};

export const getPublicMerchantLanding = async (slug: string) => getMerchantLandingBySlug(slug);

export const consumeMerchantCheckInToken = async (_token: string, _context?: { ip?: string | null }) => {
  throw new AppError('Merchant check-in is not supported by the current database schema', 501);
};
