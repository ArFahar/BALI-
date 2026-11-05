import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../src/config.js';
import { FileKbStore } from '../src/kb/store.js';
import { CATEGORIES } from '../src/types.js';

/** Integrity checks over the real v2 knowledge base produced by knowledge/pipeline (no model needed). */
const PROC = path.join(REPO_ROOT, 'knowledge', 'processing');
const readJsonl = (f: string) => fs.readFileSync(path.join(PROC, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const chunks = readJsonl('stage3_chunks/chunks.jsonl');
const docs: Record<string, unknown>[] = JSON.parse(fs.readFileSync(path.join(PROC, 'stage2_structured', 'knowledge_documents.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(PROC, 'stage4_embeddings', 'manifest.json'), 'utf8'));

describe('v2 knowledge base integrity', () => {
  it('loads every chunk with its vector', async () => {
    const store = FileKbStore.load(PROC);
    expect(await store.count()).toBe(chunks.length);
    expect(await store.embeddingModel()).toBe('local:Xenova/multilingual-e5-small');
    expect(manifest.dimensions).toBe(384);
  });

  it('covers all eight categories', () => {
    expect(new Set(chunks.map((c) => c.category))).toEqual(new Set(CATEGORIES));
  });

  it('keeps every chunk within the embedding model input limit', () => {
    expect(Math.max(...chunks.map((c) => c.token_count))).toBeLessThanOrEqual(480);
  });

  it('never claims verification that has not happened', () => {
    for (const d of docs) {
      if (d.validation_status === 'VERIFIED') expect(d.validated_by).toBeTruthy();
      expect(d.source_type).not.toBe('COMMUNITY_VERIFIED');
    }
    expect(docs.filter((d) => d.validation_status === 'VERIFIED')).toHaveLength(0);
  });

  it('flags the awig-awig as an unofficial translation of the 2012 edition', () => {
    const awig = docs.find((d) => d.document_id === 'CANGGU-AWIG-2012-ID')!;
    expect(awig.flags).toEqual(expect.arrayContaining(['UNOFFICIAL_TRANSLATION', 'EDITION_2012_VALIDITY_UNCONFIRMED']));
    for (const c of chunks.filter((x) => x.document_id === 'CANGGU-AWIG-2012-ID')) {
      expect(c.page_ref_type).toBe('original_scan_page');
      expect(c.context_header).toMatch(/terjemahan tidak resmi/);
    }
  });

  it('tags research-pack summaries of the foreign-tourist circular so they never read as binding everyone', () => {
    for (const id of ['PILOT-PB-001', 'PILOT-TE-001', 'PILOT-TE-002']) {
      const c = chunks.find((x) => x.document_id === id)!;
      expect(c.applicable_to).toContain('foreign_tourist');
      expect(c.flags).toContain('SUMMARY_OF_FOREIGN_TOURIST_CIRCULAR');
    }
  });

  it('gives every official source a URL except the awig-awig, whose origin is unknown and flagged', () => {
    for (const d of docs.filter((x) => x.source_type === 'OFFICIAL')) {
      if (d.document_id === 'CANGGU-AWIG-2012-ID') expect(d.flags).toContain('SOURCE_URL_UNKNOWN');
      else expect(d.source_url).toMatch(/^https:\/\//);
    }
  });
});
