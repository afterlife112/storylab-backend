import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  REFRESH_COOKIE_NAME: z.string().default('kol_refresh_token'),
  UPLOAD_DIR: z.string().default('uploads'),
  APP_BASE_URL: z.string().url(),
  FRONTEND_MERCHANT_ORIGIN: z.string().url(),
  FRONTEND_USER_ORIGIN: z.string().url(),
  FRONTEND_ADMIN_ORIGIN: z.string().url(),
  REVENUE_MONSTER_WEBHOOK_SECRET: z.string().min(1),
  TIMEZONE: z.string().default('Asia/Kuala_Lumpur')
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = {
  ...parsed.data
};
