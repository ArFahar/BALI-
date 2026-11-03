import fs from 'node:fs';
import path from 'node:path';
import { config, SERVER_ROOT } from '../config.js';
import { closePool, getPool } from '../db/pool.js';

async function main() {
  const pool = getPool();
  const dir = path.join(SERVER_ROOT, 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8').replaceAll('{{EMBEDDING_DIM}}', String(config.embeddingDim));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`apply  ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error('Migration failed:', err.message);
    await closePool();
    process.exit(1);
  });
