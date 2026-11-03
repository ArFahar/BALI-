import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { KnowledgeChunk, RetrievalFilter, ScoredChunk } from '../types.js';
import { cosine, type Embedder } from './embeddings.js';
import { embeddingText } from './knowledge.js';

export interface VectorStore {
  readonly kind: 'memory' | 'pgvector';
  count(): Promise<number>;
  search(queryEmbedding: number[], filter: RetrievalFilter, topK: number): Promise<ScoredChunk[]>;
  categories(): Promise<{ category: string; documents: number }[]>;
  ping(): Promise<boolean>;
}

export function contentHash(c: KnowledgeChunk): string {
  return crypto.createHash('sha256').update(embeddingText(c)).digest('hex').slice(0, 16);
}

/**
 * In-process vector store used when no DATABASE_URL is configured.
 * Embeddings are cached on disk keyed by model + content hash so restarts are fast.
 */
export class MemoryVectorStore implements VectorStore {
  readonly kind = 'memory' as const;
  private rows: { chunk: KnowledgeChunk; embedding: number[] }[] = [];

  static async build(chunks: KnowledgeChunk[], embedder: Embedder, cacheDir?: string) {
    const store = new MemoryVectorStore();
    const cacheFile = cacheDir
      ? path.join(cacheDir, `embeddings-${embedder.id.replace(/[^a-z0-9]+/gi, '_')}.json`)
      : null;
    let cache: Record<string, number[]> = {};
    if (cacheFile && fs.existsSync(cacheFile)) {
      cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    const missing = chunks.filter((c) => !cache[contentHash(c)]);
    if (missing.length) {
      const vectors = await embedder.embedPassages(missing.map(embeddingText));
      missing.forEach((c, i) => (cache[contentHash(c)] = vectors[i]));
      if (cacheFile) {
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify(cache));
      }
    }
    store.rows = chunks.map((chunk) => ({ chunk, embedding: cache[contentHash(chunk)] }));
    return store;
  }

  async count() {
    return this.rows.length;
  }

  async search(q: number[], filter: RetrievalFilter, topK: number) {
    return this.rows
      .filter(
        ({ chunk }) =>
          chunk.language === filter.language &&
          filter.scopes.includes(chunk.location) &&
          !filter.excludeStatuses.includes(chunk.validation_status),
      )
      .map(({ chunk, embedding }) => ({ chunk, score: cosine(q, embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async categories() {
    const counts = new Map<string, Set<string>>();
    for (const { chunk } of this.rows) {
      if (!counts.has(chunk.category)) counts.set(chunk.category, new Set());
      counts.get(chunk.category)!.add(chunk.doc_id);
    }
    return [...counts].map(([category, docs]) => ({ category, documents: docs.size }));
  }

  async ping() {
    return true;
  }
}
