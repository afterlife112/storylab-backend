import 'dotenv/config';
import { env } from './config/env';
import { ensureDefaultSettings } from './services/settings.service';
import { prisma } from './lib/prisma';
import { buildApp } from './app';

const start = async () => {
  await ensureDefaultSettings();
  const app = buildApp();
  app.listen(env.PORT, () => {
    console.log(`api-server running on http://localhost:${env.PORT}`);
  });
};

start().catch(async (error) => {
  console.error('Failed to start server', error);
  await prisma.$disconnect();
  process.exit(1);
});
