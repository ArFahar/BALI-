import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';

export interface FeedbackInput {
  conversation_id: string;
  message_id?: string;
  rating: 'helpful' | 'not_helpful';
  comment?: string;
  source_ids?: string[];
  language?: string;
}

export interface FeedbackStore {
  readonly kind: 'file' | 'postgres';
  save(f: FeedbackInput): Promise<void>;
}

/** Append-only JSON Lines file (default when no database is configured). */
export class FileFeedbackStore implements FeedbackStore {
  readonly kind = 'file' as const;
  constructor(private readonly file: string) {}

  async save(f: FeedbackInput) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    await fs.promises.appendFile(this.file, JSON.stringify({ ...f, created_at: new Date().toISOString() }) + '\n');
  }
}

export class PgFeedbackStore implements FeedbackStore {
  readonly kind = 'postgres' as const;
  constructor(private readonly pool: pg.Pool) {}

  async save(f: FeedbackInput) {
    await this.pool.query(
      `INSERT INTO feedback (conversation_id, message_id, rating, comment, source_ids, language)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [f.conversation_id, f.message_id ?? null, f.rating, f.comment ?? null, f.source_ids ?? [], f.language ?? null],
    );
  }
}
