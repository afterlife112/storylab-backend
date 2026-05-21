import { QueryResultRow } from 'pg';
import { query, SqlClient } from './db';

export const sql = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  client?: SqlClient
) => {
  const executor = client ?? { query };
  return executor.query<T>(text, params);
};

export const one = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  client?: SqlClient
) => {
  const result = await sql<T>(text, params, client);
  return result.rows[0] ?? null;
};

export const many = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  client?: SqlClient
) => {
  const result = await sql<T>(text, params, client);
  return result.rows;
};
