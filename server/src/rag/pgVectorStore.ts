import type pg from 'pg';
import type { KnowledgeChunk, RetrievalFilter, ScoredChunk } from '../types.js';
import { toVectorLiteral } from '../db/pool.js';
import type { Embedder } from './embeddings.js';
import { embeddingText } from './knowledge.js';
import { contentHash, type VectorStore } from './vectorStore.js';

const COLUMNS = `id, doc_id, language, title, content, why, actions, category, location, applies_to,
  source_name, source_url, source_type, validation_status, validated_by,
  to_char(effective_date, 'YYYY-MM-DD') AS effective_date, last_verified_at, is_demo_data, notes`;

function rowToChunk(r: Record<string, unknown>): KnowledgeChunk {
  return {
    ...(r as unknown as KnowledgeChunk),
    last_verified_at: r.last_verified_at ? new Date(r.last_verified_at as string).toISOString() : null,
  };
}

export class PgVectorStore implements VectorStore {
  readonly kind = 'pgvector' as const;

  constructor(private readonly pool: pg.Pool) {}

  async count() {
    const { rows } = await this.pool.query('SELECT count(*)::int AS n FROM knowledge_documents');
    return rows[0].n as number;
  }

  async search(q: number[], filter: RetrievalFilter, topK: number): Promise<ScoredChunk[]> {
    const { rows } = await this.pool.query(
      `SELECT ${COLUMNS}, 1 - (embedding <=> $1::vector) AS score
         FROM knowledge_documents
        WHERE language = $2
          AND location = ANY($3::text[])
          AND NOT (validation_status::text = ANY($4::text[]))
        ORDER BY embedding <=> $1::vector
        LIMIT $5`,
      [toVectorLiteral(q), filter.language, filter.scopes, filter.excludeStatuses, topK],
    );
    return rows.map((r) => {
      const { score, ...rest } = r;
      return { chunk: rowToChunk(rest), score: Number(score) };
    });
  }

  async categories() {
    const { rows } = await this.pool.query(
      `SELECT category, count(DISTINCT doc_id)::int AS documents
         FROM knowledge_documents WHERE validation_status <> 'EXPIRED'
        GROUP BY category ORDER BY category`,
    );
    return rows as { category: string; documents: number }[];
  }

  async ping() {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /** Upsert chunks; only re-embeds rows whose content or embedding model changed. */
  async upsert(chunks: KnowledgeChunk[], embedder: Embedder) {
    const { rows } = await this.pool.query('SELECT id, content_hash, embedding_model FROM knowledge_documents');
    const existing = new Map(rows.map((r) => [r.id as string, r]));
    const stale = chunks.filter((c) => {
      const e = existing.get(c.id);
      return !e || e.content_hash !== contentHash(c) || e.embedding_model !== embedder.id;
    });
    const vectors = stale.length ? await embedder.embedPassages(stale.map(embeddingText)) : [];
    const vecById = new Map(stale.map((c, i) => [c.id, vectors[i]]));

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const c of chunks) {
        const v = vecById.get(c.id);
        const params = [
          c.id, c.doc_id, c.language, c.title, c.content, c.why, JSON.stringify(c.actions), c.category,
          c.location, c.applies_to, c.source_name, c.source_url, c.source_type, c.validation_status,
          c.validated_by, c.effective_date, c.last_verified_at, c.is_demo_data, c.notes, contentHash(c),
        ];
        if (v) {
          await client.query(
            `INSERT INTO knowledge_documents (id, doc_id, language, title, content, why, actions, category,
               location, applies_to, source_name, source_url, source_type, validation_status, validated_by,
               effective_date, last_verified_at, is_demo_data, notes, content_hash, embedding_model, embedding)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::vector)
             ON CONFLICT (id) DO UPDATE SET
               doc_id=EXCLUDED.doc_id, language=EXCLUDED.language, title=EXCLUDED.title, content=EXCLUDED.content,
               why=EXCLUDED.why, actions=EXCLUDED.actions, category=EXCLUDED.category, location=EXCLUDED.location,
               applies_to=EXCLUDED.applies_to, source_name=EXCLUDED.source_name, source_url=EXCLUDED.source_url,
               source_type=EXCLUDED.source_type, validation_status=EXCLUDED.validation_status,
               validated_by=EXCLUDED.validated_by, effective_date=EXCLUDED.effective_date,
               last_verified_at=EXCLUDED.last_verified_at, is_demo_data=EXCLUDED.is_demo_data, notes=EXCLUDED.notes,
               content_hash=EXCLUDED.content_hash, embedding_model=EXCLUDED.embedding_model,
               embedding=EXCLUDED.embedding, updated_at=now()`,
            [...params, embedder.id, toVectorLiteral(v)],
          );
        } else {
          // Metadata-only update (e.g. validation status changed) keeps the existing embedding.
          await client.query(
            `UPDATE knowledge_documents SET doc_id=$2, language=$3, title=$4, content=$5, why=$6, actions=$7,
               category=$8, location=$9, applies_to=$10, source_name=$11, source_url=$12, source_type=$13,
               validation_status=$14, validated_by=$15, effective_date=$16, last_verified_at=$17,
               is_demo_data=$18, notes=$19, content_hash=$20, updated_at=now()
             WHERE id=$1`,
            params,
          );
        }
      }
      const ids = chunks.map((c) => c.id);
      const removed = await client.query('DELETE FROM knowledge_documents WHERE NOT (id = ANY($1::text[]))', [ids]);
      await client.query('COMMIT');
      return { embedded: stale.length, total: chunks.length, removed: removed.rowCount ?? 0 };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
