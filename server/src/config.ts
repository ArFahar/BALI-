import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

  llmProvider: oneOf('LLM_PROVIDER', ['gemini', 'none'] as const, process.env.GEMINI_API_KEY ? 'gemini' : 'none'),
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
  llmTimeoutMs: num('LLM_TIMEOUT_MS', 20000),

  embeddingProvider: oneOf('EMBEDDING_PROVIDER', ['local', 'gemini'] as const, 'local'),
  localEmbeddingModel: process.env.LOCAL_EMBEDDING_MODEL?.trim() || 'Xenova/multilingual-e5-small',
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001',
  embeddingDim: num('EMBEDDING_DIM', 384),

  vectorStore: oneOf('VECTOR_STORE', ['memory', 'pgvector'] as const, databaseUrl ? 'pgvector' : 'memory'),
  databaseUrl,

  retrievalTopK: num('RETRIEVAL_TOP_K', 4),
  /** Below this cosine similarity a chunk is discarded. Calibrated for multilingual-e5-small (see docs/AI_IMPLEMENTATION.md). */
  retrievalMinScore: num('RETRIEVAL_MIN_SCORE', 0.8),
  /** At or above this score the match is considered strong. */
  retrievalStrongScore: num('RETRIEVAL_STRONG_SCORE', 0.84),
  /** Required score when the keyword classifier found no matching category for the chunk. */
  retrievalStandaloneScore: num('RETRIEVAL_STANDALONE_SCORE', 0.86),

  knowledgePath: path.resolve(REPO_ROOT, process.env.KNOWLEDGE_PATH ?? 'knowledge/scenarios.json'),
  cacheDir: path.resolve(SERVER_ROOT, '.cache'),
  dataDir: path.resolve(SERVER_ROOT, 'data'),
};

export type AppConfig = typeof config;
