export const Roles = {
  ADMIN: 'ADMIN',
  MERCHANT: 'MERCHANT',
  INFLUENCER: 'INFLUENCER'
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

export const AccountStatuses = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  PENDING: 'PENDING',
  BANNED: 'BANNED'
} as const;

export type AccountStatus = (typeof AccountStatuses)[keyof typeof AccountStatuses];

export const VerificationStatuses = {
  UNVERIFIED: 'UNVERIFIED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED'
} as const;

export type VerificationStatus = (typeof VerificationStatuses)[keyof typeof VerificationStatuses];

export const WithdrawalStatuses = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  PAID: 'PAID',
  REJECTED: 'REJECTED'
} as const;

export type WithdrawalStatus = (typeof WithdrawalStatuses)[keyof typeof WithdrawalStatuses];

export const MissionStatuses = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
} as const;

export type MissionStatus = (typeof MissionStatuses)[keyof typeof MissionStatuses];

export const PricingModes = {
  FIXED_BUDGET: 'FIXED_BUDGET',
  COMMISSION_POOL: 'COMMISSION_POOL'
} as const;

export type PricingMode = (typeof PricingModes)[keyof typeof PricingModes];

export const NotificationTypes = {
  SYSTEM: 'SYSTEM',
  MISSION: 'MISSION',
  PAYMENT: 'PAYMENT',
  CHAT: 'CHAT'
} as const;

export type NotificationType = (typeof NotificationTypes)[keyof typeof NotificationTypes];
