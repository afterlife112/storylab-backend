import 'dotenv/config';
import { env } from './config/env';
import { endPool } from './database/db';
import { buildApp } from './app';

const start = async () => {
  const app = buildApp();
  app.listen(env.PORT, () => {
    console.log(`api-server running on http://localhost:${env.PORT}`);
  });
};

start().catch(async (error) => {
  console.error('Failed to start server', error);
  await endPool();
  process.exit(1);
});
