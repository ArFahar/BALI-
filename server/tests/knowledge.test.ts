import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadKnowledgeFile, parseKnowledge } from '../src/rag/knowledge.js';
import { knowledgePath } from './helpers.js';

describe('knowledge base integrity', () => {
  const chunks = loadKnowledgeFile(knowledgePath);
  const raw = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));

  it('has 10–15 scenarios, each in English and Indonesian', () => {
    const docIds = new Set(chunks.map((c) => c.doc_id));
    expect(docIds.size).toBeGreaterThanOrEqual(10);
    expect(docIds.size).toBeLessThanOrEqual(15);
    for (const id of docIds) {
      expect(chunks.filter((c) => c.doc_id === id).map((c) => c.language).sort()).toEqual(['en', 'id']);
    }
  });

  it('covers all eight knowledge categories', () => {
    expect(new Set(chunks.map((c) => c.category)).size).toBe(8);
  });

  it('never marks anything VERIFIED without a named human validator', () => {
    for (const c of chunks) {
      if (c.validation_status === 'VERIFIED') {
        expect(c.validated_by).toBeTruthy();
        expect(c.last_verified_at).toBeTruthy();
      }
    }
  });

  it('labels editorial content as DEMO_DATA, UNVERIFIED and GENERAL_ADVISORY', () => {
    const demo = chunks.filter((c) => c.is_demo_data);
    expect(demo.length).toBeGreaterThan(0);
    for (const c of demo) {
      expect(c.validation_status).toBe('UNVERIFIED');
      expect(c.source_type).toBe('GENERAL_ADVISORY');
      expect(c.notes).toMatch(/DEMO_DATA/);
    }
  });

  it('does not claim community verification that does not exist', () => {
    expect(chunks.filter((c) => c.source_type === 'COMMUNITY_VERIFIED')).toHaveLength(0);
  });

  it('gives every official regulation a source URL', () => {
    for (const c of chunks.filter((c) => c.source_type === 'OFFICIAL_REGULATION')) {
      expect(c.source_url).toMatch(/^https:\/\//);
    }
  });

  it('rejects a VERIFIED document with no validator', () => {
    const bad = structuredClone(raw);
    bad.scenarios[0].validation_status = 'VERIFIED';
    expect(() => parseKnowledge(bad)).toThrow(/validated_by/);
  });

  it('rejects DEMO_DATA marked VERIFIED', () => {
    const bad = structuredClone(raw);
    const demo = bad.scenarios.find((s: { is_demo_data: boolean }) => s.is_demo_data);
    demo.validation_status = 'VERIFIED';
    demo.validated_by = 'someone';
    demo.last_verified_at = '2026-01-01';
    expect(() => parseKnowledge(bad)).toThrow(/DEMO_DATA/);
  });
});
