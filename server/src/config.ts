import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be a number`);
  return n;
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  if (!allowed.includes(raw as T)) {
    throw new Error(`Environment variable ${name} must be one of: ${allowed.join(', ')}`);
  }
  return raw as T;
}

const databaseUrl = process.env.DATABASE_URL?.trim() || null;

export const config = {
  port: num('PORT', 8787),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  llmProvider: oneOf('LLM_PROVIDER', ['sumopod', 'gemini', 'none'] as const,
    process.env.SUMOPOD_API_KEY ? 'sumopod' : process.env.GEMINI_API_KEY ? 'gemini' : 'none'),
  sumopodApiKey: process.env.SUMOPOD_API_KEY?.trim() || null,
  sumopodBaseUrl: process.env.SUMOPOD_BASE_URL?.trim() || 'https://ai.sumopod.com/v1',
  sumopodModel: process.env.SUMOPOD_MODEL?.trim() || 'deepseek-v4-flash',
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
  llmTimeoutMs: num('LLM_TIMEOUT_MS', 20000),
  /** Timeout for the short query-translation call (keeps one slow call from eating the answer budget). */
  translateTimeoutMs: num('TRANSLATE_TIMEOUT_MS', 5000),

  embeddingProvider: oneOf('EMBEDDING_PROVIDER', ['local', 'gemini'] as const, 'local'),
  localEmbeddingModel: process.env.LOCAL_EMBEDDING_MODEL?.trim() || 'Xenova/multilingual-e5-small',
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001',
  embeddingDim: num('EMBEDDING_DIM', 384),

  /** Where the v2 knowledge base is read from: PostgreSQL + pgvector, or the knowledge/processing output files. */
  kbSource: oneOf('KB_SOURCE', ['pgvector', 'files'] as const, databaseUrl ? 'pgvector' : 'files'),
  databaseUrl,
  processingDir: path.resolve(REPO_ROOT, process.env.KB_PROCESSING_DIR ?? 'knowledge/processing'),

  /**
   * Question translation for cross-lingual retrieval: local OPUS-MT models, the configured LLM, glossary terms only,
   * or off. Default: local, except on Vercel where the MT models exceed the function size limit (LLM, else glossary).
   */
  queryTranslator: oneOf(
    'QUERY_TRANSLATOR',
    ['local', 'llm', 'glossary', 'none'] as const,
    process.env.VERCEL ? (process.env.SUMOPOD_API_KEY ? 'llm' : 'glossary') : 'local',
  ),

  retrievalTopK: num('RETRIEVAL_TOP_K', 4),
  /** Below this cosine similarity a chunk is discarded. Calibrated for multilingual-e5-small (see docs/AI_IMPLEMENTATION.md). */
  retrievalMinScore: num('RETRIEVAL_MIN_SCORE', 0.8),
  /** At or above this score the match is considered strong. */
  retrievalStrongScore: num('RETRIEVAL_STRONG_SCORE', 0.84),
  /** Required score when the keyword classifier found no matching category for the chunk. */
  retrievalStandaloneScore: num('RETRIEVAL_STANDALONE_SCORE', 0.86),

  cacheDir: path.resolve(SERVER_ROOT, '.cache'),
  dataDir: process.env.VERCEL ? path.join(tmpdir(), 'localnorm-data') : path.resolve(SERVER_ROOT, 'data'),
};

export type AppConfig = typeof config;
