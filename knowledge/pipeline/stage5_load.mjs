/**
 * Stage 5 - Store documents, chunks and vectors in PostgreSQL + pgvector.
 *
 *   DATABASE_URL=postgresql://localnorm:localnorm@localhost:5433/localnorm node knowledge/pipeline/stage5_load.mjs
 *   (schema first: npm run migrate)
 *
 * Inputs: stage2_structured/knowledge_documents.json, stage3_chunks/chunks.jsonl,
 *         stage4_embeddings/embeddings.jsonl + manifest.json
 * Output: rows in knowledge_documents / knowledge_chunks / knowledge_ingest_runs, and STAGE5_REPORT.md
 *
 * - Refuses to load if a vector's content hash does not match its chunk (stale embeddings).
 * - Idempotent: upserts by key, deletes chunks/documents that are no longer produced, all in one transaction.
 * - Verifies afterwards that pgvector returns the same top results as exact in-memory cosine.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { env, pipeline } from '@huggingface/transformers';

/** TLS settings for Supabase etc. Keep in sync with server/src/db/pool.ts (pgConfig). */
function pgConfig(url) {
  const parsed = new URL(url);
  const caRaw = process.env.DATABASE_SSL_CA?.trim();
  const isSupabase = /\.supabase\.(co|com)$/i.test(parsed.hostname);
  const mode = process.env.DATABASE_SSL?.trim() || (caRaw ? 'verify' : isSupabase ? 'require' : '');
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
  console.warn('[db] TLS enabled without certificate verification; set DATABASE_SSL_CA to verify the server.');
  return { connectionString, ssl: { rejectUnauthorized: false } };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROC = path.join(ROOT, 'knowledge', 'processing');
// Same settings file as the API (existing environment variables win).
dotenv.config({ path: path.join(ROOT, 'server', '.env') });
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const readJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
// RFC 4122 UUIDv5 so ids are stable across reloads.
const NS = Buffer.from('6f1c0a2e7b3d4c5e9a8b1c2d3e4f5a6b', 'hex');
function uuid5(name) {
  const h = crypto.createHash('sha1').update(Buffer.concat([NS, Buffer.from(name, 'utf8')])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const vec = (v) => `[${v.join(',')}]`;

const docs = JSON.parse(fs.readFileSync(path.join(PROC, 'stage2_structured', 'knowledge_documents.json'), 'utf8'));
const chunks = readJsonl(path.join(PROC, 'stage3_chunks', 'chunks.jsonl'));
const embeds = new Map(readJsonl(path.join(PROC, 'stage4_embeddings', 'embeddings.jsonl')).map((e) => [e.chunk_id, e]));
const manifest = JSON.parse(fs.readFileSync(path.join(PROC, 'stage4_embeddings', 'manifest.json'), 'utf8'));

// ---------------------------------------------------------------- pre-flight checks
const problems = [];
for (const c of chunks) {
  const e = embeds.get(c.chunk_id);
  if (!e) problems.push(`no embedding for ${c.chunk_id}`);
  else if (e.content_sha256 !== sha256(c.content)) problems.push(`stale embedding for ${c.chunk_id} (content changed after Stage 4)`);
  else if (e.embedding.length !== manifest.dimensions) problems.push(`wrong dimension for ${c.chunk_id}`);
}
const docKeys = new Set(docs.map((d) => d.document_id));
for (const c of chunks) if (!docKeys.has(c.document_id)) problems.push(`chunk ${c.chunk_id} has no document ${c.document_id}`);
if (manifest.chunks_file_sha256 !== sha256(fs.readFileSync(path.join(PROC, 'stage3_chunks', 'chunks.jsonl')))) {
  problems.push('chunks.jsonl changed after embeddings were generated - re-run Stage 4');
}
if (problems.length) {
  console.error(`Refusing to load:\n- ${problems.slice(0, 20).join('\n- ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------- load
const client = new pg.Client({ ...pgConfig(DATABASE_URL), connectionTimeoutMillis: 15000 });
await client.connect();
const { rows: ext } = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
const { rows: ver } = await client.query('SHOW server_version');
const usedDocs = docs.filter((d) => chunks.some((c) => c.document_id === d.document_id));

try {
  await client.query('BEGIN');
  for (const d of usedDocs) {
    await client.query(
      `INSERT INTO knowledge_documents (id, document_key, title, publisher, source_type, source_subtype, source_url,
         all_source_urls, location_scope, validation_status, validated_by, effective_date, effective_date_note,
         language, sha256, flags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (document_key) DO UPDATE SET title=EXCLUDED.title, publisher=EXCLUDED.publisher,
         source_type=EXCLUDED.source_type, source_subtype=EXCLUDED.source_subtype, source_url=EXCLUDED.source_url,
         all_source_urls=EXCLUDED.all_source_urls, location_scope=EXCLUDED.location_scope,
         validation_status=EXCLUDED.validation_status, validated_by=EXCLUDED.validated_by,
         effective_date=EXCLUDED.effective_date, effective_date_note=EXCLUDED.effective_date_note,
         language=EXCLUDED.language, sha256=EXCLUDED.sha256, flags=EXCLUDED.flags, updated_at=now()`,
      [uuid5(`doc:${d.document_id}`), d.document_id, d.title, d.publisher, d.source_type, d.source_subtype, d.source_url,
       d.all_source_urls ? JSON.stringify(d.all_source_urls) : null, d.location_scope, d.validation_status, d.validated_by,
       d.effective_date, d.effective_date_note, d.language, d.sha256, d.flags],
    );
  }
  for (const c of chunks) {
    await client.query(
      `INSERT INTO knowledge_chunks (id, document_id, chunk_key, unit_ids, context_header, articles, chapter, part, content,
         content_sha256, token_count, category, location_scope, applicable_to, page_number, page_numbers, page_ref_type,
         language, flags, embedding_model, embedding)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::vector)
       ON CONFLICT (chunk_key) DO UPDATE SET document_id=EXCLUDED.document_id, unit_ids=EXCLUDED.unit_ids,
         context_header=EXCLUDED.context_header, articles=EXCLUDED.articles, chapter=EXCLUDED.chapter, part=EXCLUDED.part,
         content=EXCLUDED.content, content_sha256=EXCLUDED.content_sha256, token_count=EXCLUDED.token_count,
         category=EXCLUDED.category, location_scope=EXCLUDED.location_scope, applicable_to=EXCLUDED.applicable_to,
         page_number=EXCLUDED.page_number, page_numbers=EXCLUDED.page_numbers, page_ref_type=EXCLUDED.page_ref_type,
         language=EXCLUDED.language, flags=EXCLUDED.flags, embedding_model=EXCLUDED.embedding_model,
         embedding=EXCLUDED.embedding`,
      [uuid5(`chunk:${c.chunk_id}`), uuid5(`doc:${c.document_id}`), c.chunk_id, c.unit_ids, c.context_header, c.articles,
       c.chapter, c.part, c.content, sha256(c.content), c.token_count, c.category, c.location_scope, c.applicable_to,
       c.page_number, c.page_numbers, c.page_ref_type, c.language, c.flags, manifest.embedding_model_id,
       vec(embeds.get(c.chunk_id).embedding)],
    );
  }
  const delChunks = await client.query('DELETE FROM knowledge_chunks WHERE NOT (chunk_key = ANY($1::text[]))', [chunks.map((c) => c.chunk_id)]);
  const delDocs = await client.query('DELETE FROM knowledge_documents WHERE NOT (document_key = ANY($1::text[]))', [usedDocs.map((d) => d.document_id)]);
  await client.query(
    `INSERT INTO knowledge_ingest_runs (embedding_model, onnx_sha256, chunks_sha256, documents, chunks, manifest)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [manifest.embedding_model_id, manifest.onnx_sha256, manifest.chunks_file_sha256, usedDocs.length, chunks.length, JSON.stringify(manifest)],
  );
  await client.query('COMMIT');
  console.log(`loaded ${usedDocs.length} documents, ${chunks.length} chunks; removed ${delChunks.rowCount} stale chunks, ${delDocs.rowCount} stale documents`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Load failed, rolled back:', err.message);
  await client.end();
  process.exit(1);
}

// ---------------------------------------------------------------- verification
const q1 = async (sql, p = []) => (await client.query(sql, p)).rows;
const counts = (await q1(`SELECT (SELECT count(*) FROM knowledge_documents)::int AS docs, (SELECT count(*) FROM knowledge_chunks)::int AS chunks,
  (SELECT count(*) FROM knowledge_chunks WHERE vector_dims(embedding) = $1)::int AS dims_ok`, [manifest.dimensions]))[0];
const byCat = await q1('SELECT category, count(*)::int AS n FROM knowledge_chunks GROUP BY category ORDER BY n DESC');
const byStatus = await q1(`SELECT d.source_type, d.validation_status, count(c.*)::int AS chunks FROM knowledge_documents d
  JOIN knowledge_chunks c ON c.document_id = d.id GROUP BY 1, 2 ORDER BY 1, 2`);
const indexes = await q1("SELECT indexname FROM pg_indexes WHERE tablename = 'knowledge_chunks' ORDER BY 1");
const roundTrip = await q1(
  'SELECT chunk_key, embedding::text AS e FROM knowledge_chunks WHERE chunk_key = ANY($1::text[])',
  [[chunks[0].chunk_id, chunks.at(-1).chunk_id]],
);
const maxRoundTripErr = Math.max(
  ...roundTrip.map((r) => {
    const db = JSON.parse(r.e);
    const src = embeds.get(r.chunk_key).embedding;
    return Math.max(...db.map((x, i) => Math.abs(x - src[i])));
  }),
);

// pgvector top-k must match exact in-memory cosine over the same vectors.
env.allowRemoteModels = false;
env.localModelPath = path.join(ROOT, 'server', '.cache', 'models');
const extractor = await pipeline('feature-extraction', manifest.embedding_model, { dtype: manifest.dtype });
const PROBES = [
  'Saya menyewa rumah di Canggu selama dua bulan. Apakah saya wajib melapor ke banjar?',
  'Bagaimana cara memilah sampah rumah tangga di vila saya di Canggu?',
  'Do I need a helmet and an international driving permit to ride a scooter?',
  'Apa yang tidak boleh dilakukan saat Nyepi di Canggu?',
];
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const probeRows = [];
await client.query('SET hnsw.ef_search = 100');
for (const q of PROBES) {
  const qv = (await extractor([`query: ${q}`], { pooling: 'mean', normalize: true })).tolist()[0];
  const sql = await q1(
    `SELECT c.chunk_key, 1 - (c.embedding <=> $1::vector) AS score, c.category, c.applicable_to, d.source_type, d.validation_status
       FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id
      ORDER BY c.embedding <=> $1::vector LIMIT 5`,
    [vec(qv)],
  );
  const exact = chunks
    .map((c) => ({ key: c.chunk_id, s: dot(qv, embeds.get(c.chunk_id).embedding) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map((x) => x.key);
  probeRows.push({ q, sql, match: sql.map((r) => r.chunk_key).join() === exact.join(), exact });
}
const plan = (await q1(
  `EXPLAIN SELECT chunk_key FROM knowledge_chunks ORDER BY embedding <=> (SELECT embedding FROM knowledge_chunks LIMIT 1) LIMIT 5`,
)).map((r) => r['QUERY PLAN']).join(' | ');
const runs = await q1('SELECT id, embedding_model, chunks, loaded_at FROM knowledge_ingest_runs ORDER BY id DESC LIMIT 3');
await client.end();

const md = [
  '# Stage 5 report - PostgreSQL + pgvector (generated)',
  '',
  `Server: PostgreSQL ${ver[0].server_version}, pgvector ${ext[0]?.extversion ?? 'MISSING'}.`,
  '',
  '## Contents',
  '',
  '| check | result |',
  '|---|---|',
  `| documents | ${counts.docs} (expected ${usedDocs.length}) ${counts.docs === usedDocs.length ? '✅' : '❌'} |`,
  `| chunks | ${counts.chunks} (expected ${chunks.length}) ${counts.chunks === chunks.length ? '✅' : '❌'} |`,
  `| vectors with ${manifest.dimensions} dimensions | ${counts.dims_ok} ${counts.dims_ok === chunks.length ? '✅' : '❌'} |`,
  `| vector round-trip max abs error (2 samples) | ${maxRoundTripErr.toExponential(2)} ${maxRoundTripErr < 1e-6 ? '✅' : '⚠️'} |`,
  `| indexes on knowledge_chunks | ${indexes.map((i) => i.indexname).join(', ')} |`,
  `| query plan (top-5 by cosine) | ${plan} |`,
  '',
  '## Chunks per category',
  '',
  '| category | chunks |',
  '|---|---|',
  ...byCat.map((r) => `| ${r.category} | ${r.n} |`),
  '',
  '## Chunks per source type / validation status',
  '',
  '| source_type | validation_status | chunks |',
  '|---|---|---|',
  ...byStatus.map((r) => `| ${r.source_type} | ${r.validation_status} | ${r.chunks} |`),
  '',
  '## pgvector search vs exact cosine (top 5, no filters)',
  '',
  'With ~120 rows PostgreSQL may use a sequential scan instead of the HNSW index; both must return the exact order.',
  '',
  ...probeRows.flatMap((p) => [
    `**${p.q}** — pgvector order equals exact cosine: ${p.match ? '✅' : '❌'}`,
    '',
    ...p.sql.map((r, i) => `${i + 1}. \`${Number(r.score).toFixed(3)}\` ${r.chunk_key} — ${r.category} · ${r.source_type}/${r.validation_status} · applies to ${r.applicable_to.join(', ')}`),
    '',
  ]),
  '## Ingest runs',
  '',
  ...runs.map((r) => `- #${r.id} ${r.embedding_model}, ${r.chunks} chunks, ${new Date(r.loaded_at).toISOString()}`),
  '',
];
fs.writeFileSync(path.join(PROC, 'STAGE5_REPORT.md'), md.join('\n'));
console.log(md.slice(4, 14).join('\n'));
