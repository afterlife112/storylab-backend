import { withClient } from './db';

export const transaction = async <T>(callback: (client: Awaited<ReturnType<typeof withClient>> extends never ? never : any) => Promise<T>) =>
  withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
