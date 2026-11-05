import fs from 'node:fs';
import pg from 'pg';
import { config } from '../config.js';

let pool: pg.Pool | null = null;

/**
 * Connection settings with explicit TLS handling (needed for Supabase).
 *
 * DATABASE_SSL: off | require (encrypted, certificate not verified) | verify (verified against DATABASE_SSL_CA).
 * Default: `verify` when DATABASE_SSL_CA is set; `require` for Supabase hosts without a CA (logged as a warning);
 * otherwise whatever the connection string says (local Docker: no TLS).
 * DATABASE_SSL_CA: path to the CA file, or the PEM text itself (handy for Vercel environment variables).
 *
 * node-postgres lets `sslmode` in the URL override the `ssl` object, so those parameters are removed when we set TLS here.
 * Keep in sync with knowledge/pipeline/stage5_load.mjs (pgConfig).
 */
export function pgConfig(url: string, env: NodeJS.ProcessEnv = process.env, warn: (m: string) => void = console.warn): pg.ClientConfig {
  const parsed = new URL(url);
  const caRaw = env.DATABASE_SSL_CA?.trim();
  const isSupabase = /\.supabase\.(co|com)$/i.test(parsed.hostname);
  const mode = env.DATABASE_SSL?.trim() || (caRaw ? 'verify' : isSupabase ? 'require' : '');
  if (!mode) return { connectionString: url };
  if (!['off', 'require', 'verify'].includes(mode)) throw new Error('DATABASE_SSL must be one of: off, require, verify');
  for (const k of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) parsed.searchParams.delete(k);
  const connectionString = parsed.toString();
  if (mode === 'off') return { connectionString, ssl: false };
  if (mode === 'verify') {
    if (!caRaw) throw new Error('DATABASE_SSL=verify requires DATABASE_SSL_CA (file path or PEM text)');
    const ca = caRaw.startsWith('-----BEGIN') ? caRaw.replace(/\\n/g, '\n') : fs.readFileSync(caRaw, 'utf8');
    return { connectionString, ssl: { ca, rejectUnauthorized: true } };
  }
  warn('[db] TLS enabled without certificate verification; set DATABASE_SSL_CA (Supabase: Database Settings > SSL) to verify the server.');
  return { connectionString, ssl: { rejectUnauthorized: false } };
}

export function getPool(): pg.Pool {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is not configured');
  if (!pool) {
    pool = new pg.Pool({ ...pgConfig(config.databaseUrl), max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 });
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
