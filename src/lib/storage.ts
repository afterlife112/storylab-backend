import { LocalStorageProvider } from '../adapters/storage.adapter';
import { env } from '../config/env';

export const storageProvider = new LocalStorageProvider(env.APP_BASE_URL);