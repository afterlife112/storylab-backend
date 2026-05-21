import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export type SqlClient = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export const query = <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
  pool.query<T>(text, params);

export const withClient = async <T>(callback: (client: PoolClient) => Promise<T>) => {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
};

export const endPool = async () => {
  await pool.end();
};

export type SqlQueryResult<T extends QueryResultRow = QueryResultRow> = QueryResult<T>;
