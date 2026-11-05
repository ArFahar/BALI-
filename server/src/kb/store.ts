import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import type { DocumentScope, KbChunk, RetrievalFilter } from '../types.js';

/**
 * Read access to the v2 knowledge base produced by knowledge/pipeline (stages 1-5).
 * Vectors are precomputed in stage 4, so the server only embeds queries.
 */
export interface KbStore {
  readonly kind: 'pgvector' | 'files';
  count(): Promise<number>;
  search(queryEmbedding: number[], filter: RetrievalFilter, topK: number): Promise<{ chunk: KbChunk; score: number }[]>;
  categories(): Promise<{ category: string; chunks: number; documents: number }[]>;
  embeddingModel(): Promise<string | null>;
  ping(): Promise<boolean>;
}

const toVector = (v: number[]) => `[${v.join(',')}]`;
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

/** PostgreSQL + pgvector (knowledge_documents 1 - n knowledge_chunks). */
export class PgKbStore implements KbStore {
  readonly kind = 'pgvector' as const;
  constructor(private readonly pool: pg.Pool) {}

  async count() {
    const { rows } = await this.pool.query('SELECT count(*)::int AS n FROM knowledge_chunks');
    return rows[0].n as number;
  }

  async search(q: number[], filter: RetrievalFilter, topK: number) {
    const { rows } = await this.pool.query(
      `SELECT c.chunk_key, d.document_key, d.title AS document_title, d.publisher, c.context_header, c.articles, c.chapter,
              c.content, c.category, c.location_scope, c.applicable_to, d.source_type, d.source_subtype, d.source_url,
              d.validation_status, to_char(d.effective_date, 'YYYY-MM-DD') AS effective_date, c.page_number,
              c.page_numbers, c.page_ref_type, c.language, c.flags,
              1 - (c.embedding <=> $1::vector) AS score
         FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id
        WHERE c.location_scope = ANY($2::text[]) AND NOT (d.validation_status = ANY($3::text[]))
        ORDER BY c.embedding <=> $1::vector
        LIMIT $4`,
      [toVector(q), filter.scopes, filter.excludeStatuses, topK],
    );
    return rows.map(({ score, ...chunk }) => ({ chunk: chunk as KbChunk, score: Number(score) }));
  }

  async categories() {
    const { rows } = await this.pool.query(
      `SELECT c.category, count(*)::int AS chunks, count(DISTINCT c.document_id)::int AS documents
         FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id
        WHERE d.validation_status <> 'EXPIRED' GROUP BY c.category`,
    );
    return rows as { category: string; chunks: number; documents: number }[];
  }

  async embeddingModel() {
    const { rows } = await this.pool.query('SELECT embedding_model FROM knowledge_ingest_runs ORDER BY id DESC LIMIT 1');
    return (rows[0]?.embedding_model as string) ?? null;
  }

  async ping() {
    try {
      await this.pool.query('SELECT 1 FROM knowledge_chunks LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Same data read straight from the pipeline output files (no database). Used for tests and for running the
 * app without Docker; search is exact cosine over the stage-4 vectors.
 */
export class FileKbStore implements KbStore {
  readonly kind = 'files' as const;
  private constructor(
    private readonly rows: { chunk: KbChunk; embedding: number[] }[],
    private readonly model: string | null,
  ) {}

  static load(processingDir: string): FileKbStore {
    const readJsonl = (f: string) =>
      fs.readFileSync(path.join(processingDir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const docs = new Map<string, Record<string, unknown>>(
      (JSON.parse(fs.readFileSync(path.join(processingDir, 'stage2_structured', 'knowledge_documents.json'), 'utf8')) as Record<string, unknown>[]).map(
        (d) => [d.document_id as string, d],
      ),
    );
    const vectors = new Map<string, number[]>(readJsonl('stage4_embeddings/embeddings.jsonl').map((e) => [e.chunk_id, e.embedding]));
    const manifest = JSON.parse(fs.readFileSync(path.join(processingDir, 'stage4_embeddings', 'manifest.json'), 'utf8'));
    const rows = readJsonl('stage3_chunks/chunks.jsonl').map((c) => {
      const d = docs.get(c.document_id)!;
      const embedding = vectors.get(c.chunk_id);
      if (!embedding) throw new Error(`No embedding for ${c.chunk_id}; re-run knowledge/pipeline stage 4`);
      const chunk: KbChunk = {
        chunk_key: c.chunk_id,
        document_key: c.document_id,
        document_title: d.title as string,
        publisher: (d.publisher as string) ?? null,
        context_header: c.context_header,
        articles: c.articles,
        chapter: c.chapter,
        content: c.content,
        category: c.category,
        location_scope: c.location_scope,
        applicable_to: c.applicable_to,
        source_type: d.source_type as KbChunk['source_type'],
        source_subtype: (d.source_subtype as string) ?? null,
        source_url: (d.source_url as string) ?? null,
        validation_status: d.validation_status as KbChunk['validation_status'],
        effective_date: (d.effective_date as string) ?? null,
        page_number: c.page_number,
        page_numbers: c.page_numbers,
        page_ref_type: c.page_ref_type,
        language: c.language,
        flags: c.flags,
      };
      return { chunk, embedding };
    });
    return new FileKbStore(rows, manifest.embedding_model_id ?? null);
  }

  async count() {
    return this.rows.length;
  }

  async search(q: number[], filter: RetrievalFilter, topK: number) {
    return this.rows
      .filter(({ chunk }) => filter.scopes.includes(chunk.location_scope) && !filter.excludeStatuses.includes(chunk.validation_status))
      .map(({ chunk, embedding }) => ({ chunk, score: dot(q, embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async categories() {
    const m = new Map<string, { chunks: number; docs: Set<string> }>();
    for (const { chunk } of this.rows) {
      if (chunk.validation_status === 'EXPIRED') continue;
      const e = m.get(chunk.category) ?? { chunks: 0, docs: new Set<string>() };
      e.chunks++;
      e.docs.add(chunk.document_key);
      m.set(chunk.category, e);
    }
    return [...m].map(([category, e]) => ({ category, chunks: e.chunks, documents: e.docs.size }));
  }

  async embeddingModel() {
    return this.model;
  }

  async ping() {
    return this.rows.length > 0;
  }
}

/** Scopes that apply to a user in Canggu (Canggu is in Badung regency, Bali, Indonesia). */
export const SCOPES_FOR_CANGGU: DocumentScope[] = ['canggu', 'badung', 'bali', 'indonesia'];
