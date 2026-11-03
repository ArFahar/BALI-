import pg from 'pg';
import { config } from '../config.js';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is not configured');
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5, connectionTimeoutMillis: 5000 });
  }
  return pool;
}

export async function closePool() {
  await pool?.end();
  pool = null;
}

/** pgvector literal, e.g. '[0.1,0.2]'. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
