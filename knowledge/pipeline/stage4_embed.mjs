/**
 * Stage 4 - Embedding generation.
 *
 *   node knowledge/pipeline/stage4_embed.mjs
 *
 * Input : knowledge/processing/stage3_chunks/chunks.jsonl
 * Output: knowledge/processing/stage4_embeddings/embeddings.jsonl   {chunk_id, content_sha256, embedding[384]}
 *         knowledge/processing/stage4_embeddings/manifest.json      model, version, file hash, settings
 *         knowledge/processing/STAGE4_REPORT.md                     integrity checks + cross-lingual retrieval preview
 *
 * Settings are identical to the API server (server/src/rag/embeddings.ts) so indexed vectors and query vectors
 * come from the same model: Xenova/multilingual-e5-small, ONNX q8, mean pooling, L2-normalised,
 * "passage: " prefix for documents and "query: " prefix for questions.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { env, pipeline } from '@huggingface/transformers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROC = path.join(ROOT, 'knowledge', 'processing');
const OUT = path.join(PROC, 'stage4_embeddings');
const MODEL = 'Xenova/multilingual-e5-small';
const DTYPE = 'q8';
const MODEL_DIR = path.join(ROOT, 'server', '.cache', 'models');
// Batch size 1 on purpose: the q8 model quantises activations dynamically per batch, so a vector would change
// slightly with its batch neighbours (measured drift ~1e-2 with batches of 8). Queries are embedded one at a time,
// so documents are too - this makes indexing reproducible and consistent with query time.
const BATCH = 1;

env.allowRemoteModels = false;
env.localModelPath = MODEL_DIR;
const extractor = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });
const embed = async (texts) => (await extractor(texts, { pooling: 'mean', normalize: true })).tolist();

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const chunks = fs
  .readFileSync(path.join(PROC, 'stage3_chunks', 'chunks.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const started = Date.now();
const vectors = [];
for (let i = 0; i < chunks.length; i += BATCH) {
  vectors.push(...(await embed(chunks.slice(i, i + BATCH).map((c) => `passage: ${c.content}`))));
}
const seconds = (Date.now() - started) / 1000;

// ---------------------------------------------------------------- integrity checks
const dim = vectors[0].length;
const norms = vectors.map((v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)));
const finite = vectors.every((v) => v.every(Number.isFinite));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
let nearDuplicates = 0;
for (let i = 0; i < vectors.length; i++)
  for (let j = i + 1; j < vectors.length; j++) if (dot(vectors[i], vectors[j]) > 0.995) nearDuplicates++;

// Determinism: re-embed a sample and compare.
const sampleIdx = [0, Math.floor(chunks.length / 2), chunks.length - 1];
const drift = (a, b) => Math.max(...a.map((x, d) => Math.abs(x - b[d])));
const again = [];
for (const i of sampleIdx) again.push((await embed([`passage: ${chunks[i].content}`]))[0]);
const maxDrift = Math.max(...sampleIdx.map((ci, k) => drift(again[k], vectors[ci])));
// For the record: the same 3 chunks embedded together in one batch (what we deliberately avoid).
const batched = await embed(sampleIdx.map((i) => `passage: ${chunks[i].content}`));
const batchDrift = Math.max(...sampleIdx.map((ci, k) => drift(batched[k], vectors[ci])));

// ---------------------------------------------------------------- write outputs
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'embeddings.jsonl'),
  chunks
    .map((c, i) =>
      JSON.stringify({ chunk_id: c.chunk_id, content_sha256: sha(c.content), embedding: vectors[i].map((x) => Number(x.toFixed(7))) }),
    )
    .join('\n') + '\n',
);
// The package's "exports" map hides package.json, so read it from disk next to the resolved entry point.
const require = createRequire(import.meta.url);
const pkgDir = path.resolve(path.dirname(require.resolve('@huggingface/transformers')), '..');
const tfVersion = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;
const onnxPath = path.join(MODEL_DIR, MODEL, 'onnx', 'model_quantized.onnx');
const manifest = {
  embedding_model: MODEL,
  upstream_model: 'intfloat/multilingual-e5-small',
  runtime: `@huggingface/transformers ${tfVersion} (onnxruntime, CPU)`,
  dtype: DTYPE,
  onnx_file: 'onnx/model_quantized.onnx',
  onnx_sha256: sha(fs.readFileSync(onnxPath)),
  dimensions: dim,
  max_input_tokens: 512,
  pooling: 'mean',
  normalized: true,
  similarity: 'cosine (= dot product on normalised vectors)',
  document_prefix: 'passage: ',
  query_prefix: 'query: ',
  embedding_model_id: `local:${MODEL}`,
  chunks: chunks.length,
  chunks_file_sha256: sha(fs.readFileSync(path.join(PROC, 'stage3_chunks', 'chunks.jsonl'))),
  created_at: new Date().toISOString(),
  seconds,
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

// ---------------------------------------------------------------- retrieval preview (no filters, raw cosine)
const PROBES = [
  { q: 'Can I wear a bikini when visiting a temple?', lang: 'en' },
  { q: 'Bolehkah saya memakai bikini saat masuk pura?', lang: 'id' },
  { q: 'I am renting a house in Canggu for two months. Do I need to report to the banjar?', lang: 'en' },
  { q: 'How do I sort my rubbish at my villa in Canggu?', lang: 'en' },
  { q: 'Apa yang tidak boleh dilakukan saat Nyepi di Canggu?', lang: 'id' },
  { q: 'Do I need a helmet and an international driving permit to ride a scooter?', lang: 'en' },
  { q: 'Is there a time limit for loud music at beach clubs in Canggu?', lang: 'en' },
  { q: 'Where can I park my scooter in Canggu?', lang: 'en' },
];
const qv = await embed(PROBES.map((p) => `query: ${p.q}`));
const preview = PROBES.map((p, k) => ({
  ...p,
  top: chunks
    .map((c, i) => ({ c, s: dot(qv[k], vectors[i]) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3),
}));

const md = [
  '# Stage 4 report - embeddings (generated)',
  '',
  '## Model',
  '',
  '| field | value |',
  '|---|---|',
  ...Object.entries(manifest).map(([k, v]) => `| ${k} | ${v} |`),
  '',
  '## Integrity checks',
  '',
  '| check | result |',
  '|---|---|',
  `| vectors written | ${vectors.length} / ${chunks.length} chunks |`,
  `| dimension | ${dim} (expected 384) ${dim === 384 ? '✅' : '❌'} |`,
  `| all values finite | ${finite ? '✅' : '❌'} |`,
  `| L2 norm min / max | ${Math.min(...norms).toFixed(6)} / ${Math.max(...norms).toFixed(6)} ${Math.abs(Math.min(...norms) - 1) < 1e-3 && Math.abs(Math.max(...norms) - 1) < 1e-3 ? '✅' : '❌'} |`,
  `| near-duplicate pairs (cosine > 0.995) | ${nearDuplicates} |`,
  `| determinism: max abs drift re-embedding 3 chunks one at a time | ${maxDrift.toExponential(2)} ${maxDrift < 1e-5 ? '✅' : '⚠️'} |`,
  `| (reference) drift if the same 3 chunks are embedded as one batch | ${batchDrift.toExponential(2)} - why indexing uses batch size 1 |`,
  `| time | ${seconds.toFixed(1)} s (${(seconds / chunks.length).toFixed(2)} s/chunk) |`,
  '',
  '## Retrieval preview (raw cosine, no filters, top 3)',
  '',
  'A sanity check that semantically related chunks are found across languages - not an accuracy measurement.',
  'Filtering by applicability/location/validation and the relevance thresholds are applied later, in the RAG step (Stage 6).',
  '',
  ...preview.flatMap((p) => [
    `**${p.q}** _(${p.lang})_`,
    '',
    ...p.top.map((t, r) => `${r + 1}. \`${t.s.toFixed(3)}\` ${t.c.chunk_id} — ${t.c.category} · ${t.c.location_scope} · applies to ${t.c.applicable_to.join(', ')}`),
    '',
  ]),
];
fs.writeFileSync(path.join(PROC, 'STAGE4_REPORT.md'), md.join('\n'));
console.log(`${vectors.length} vectors (${dim}-d) in ${seconds.toFixed(1)}s; norms ${Math.min(...norms).toFixed(4)}-${Math.max(...norms).toFixed(4)}; drift ${maxDrift.toExponential(1)}`);
