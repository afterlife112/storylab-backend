import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env';
import { generalRateLimiter } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import authRoutes from './routes/auth.routes';
import merchantRoutes from './routes/merchant.routes';
import influencerRoutes from './routes/influencer.routes';
import adminRoutes from './routes/admin.routes';
import publicRoutes from './routes/public.routes';
import webhookRoutes from './routes/webhook.routes';

const configuredOrigins = [env.FRONTEND_MERCHANT_ORIGIN, env.FRONTEND_USER_ORIGIN, env.FRONTEND_ADMIN_ORIGIN];

const localDevOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export const buildApp = () => {
  process.env.TZ = env.TIMEZONE;
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (configuredOrigins.includes(origin) || (env.NODE_ENV === 'development' && localDevOriginPattern.test(origin))) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true
    })
  );
  app.use(helmet());
  app.use(morgan('dev'));
  app.use(generalRateLimiter);
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf.toString();
      }
    })
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR)));

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' }, error: null });
  });

  app.use('/auth', authRoutes);
  app.use('/public', publicRoutes);
  app.use('/merchant', merchantRoutes);
  app.use('/influencer', influencerRoutes);
  app.use('/admin', adminRoutes);
  app.use('/webhooks', webhookRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
