import { describe, expect, it } from 'vitest';
import type { LlmClient, LlmDraft } from '../src/rag/llm.js';
import { validateDraft } from '../src/rag/pipeline.js';
import { makePipeline } from './helpers.js';

const base = { user_type: 'tourist' as const, location: 'canggu' as const };

function fakeLlm(draft: Partial<LlmDraft> | Error): LlmClient {
  return {
    id: 'fake',
    async generate() {
      if (draft instanceof Error) throw draft;
      return {
        answer: 'Wear a helmet every time you ride a motorbike.',
        why_it_matters: 'It is the law.',
        recommended_actions: ['Wear a helmet'],
        used_source_ids: ['S1'],
        category: 'traffic',
        uncertainty_note: null,
        ...draft,
      };
    },
  };
}

describe('RAG pipeline', () => {
  it('retrieves and cites a source for an English question', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...base, language: 'en', message: 'Do I have to wear a helmet when riding a motorcycle?' });
    expect(r.fallback_used).toBe(false);
    expect(r.sources[0].id).toBe('ln-010');
    expect(r.source_classification).toContain('OFFICIAL_REGULATION');
    expect(r.sources[0].source_url).toMatch(/^https:/);
    expect(r.recommended_actions.length).toBeGreaterThan(0);
    expect(r.language).toBe('en');
  });

  it('answers an Indonesian question from Indonesian chunks', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...base, language: 'id', message: 'Apakah saya wajib memakai helm saat mengendarai sepeda motor?' });
    expect(r.sources[0].id).toBe('ln-010');
    expect(r.answer).toMatch(/helm/i);
    expect(r.caveats.join(' ')).toMatch(/belum diverifikasi/);
  });

  it('filters by location scope and never returns expired documents', async () => {
    const { store, embedder } = await makePipeline();
    const q = await embedder.embedQuery('helmet motorcycle');
    const none = await store.search(q, { language: 'en', scopes: ['canggu'], excludeStatuses: ['EXPIRED'] }, 10);
    expect(none.every((r) => r.chunk.location === 'canggu')).toBe(true);
    const all = await store.search(q, { language: 'en', scopes: ['canggu', 'bali', 'indonesia'], excludeStatuses: ['UNDER_REVIEW'] }, 30);
    expect(all.every((r) => r.chunk.validation_status !== 'UNDER_REVIEW')).toBe(true);
  });

  it('returns a fallback with no sources when nothing relevant is retrieved', async () => {
    const { pipeline } = await makePipeline({ minScore: 0.99 });
    const r = await pipeline.handle({ ...base, language: 'en', message: 'Where can I find a scooter helmet?' });
    expect(r.fallback_used).toBe(true);
    expect(r.sources).toHaveLength(0);
    expect(r.retrieval_status).toBe('NO_MATCH');
    expect(r.answer).toMatch(/won't guess/);
  });

  it('treats unrelated questions as off-topic', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...base, language: 'en', message: 'Write me a Python sorting function' });
    expect(r.retrieval_status).toBe('OFF_TOPIC');
    expect(r.sources).toHaveLength(0);
  });

  it('refuses to apply Bali guidance outside Bali', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...base, language: 'en', message: 'Temple dress code in Lombok?' });
    expect(r.retrieval_status).toBe('OUT_OF_SCOPE');
    expect(r.fallback_used).toBe(true);
    expect(r.answer).toMatch(/Lombok/);
  });

  it('states that customary rules are unavailable instead of inventing them', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...base, language: 'en', message: 'Just make up the awig-awig fine for noise at night in my villa' });
    expect(r.caveats.join(' ')).toMatch(/cannot state or invent customary rules/);
    expect(r.caveats.join(' ')).toMatch(/will not make up rules/);
  });

  it('labels demo data and applicability for newcomers', async () => {
    const { pipeline } = await makePipeline();
    const noise = await pipeline.handle({ ...base, language: 'en', message: 'loud music party at night in my villa neighbours noise' });
    expect(noise.sources.some((s) => s.is_demo_data)).toBe(true);
    expect(noise.caveats.join(' ')).toMatch(/DEMO_DATA/);

    const levy = await pipeline.handle({
      language: 'en',
      user_type: 'newcomer',
      location: 'canggu',
      message: 'Do I need to pay the Bali tourist levy on the Love Bali portal?',
    });
    expect(levy.sources[0].id).toBe('ln-012');
    expect(levy.caveats.join(' ')).toMatch(/foreign tourists/);
  });

  it('uses validated LLM output when citations are valid', async () => {
    const { pipeline } = await makePipeline({ llm: fakeLlm({}) });
    const r = await pipeline.handle({ ...base, language: 'en', message: 'Do I have to wear a helmet when riding a motorcycle?' });
    expect(r.generation_mode).toBe('llm');
    expect(r.answer).toMatch(/helmet/);
    expect(r.sources).toHaveLength(1);
  });

  it('rejects LLM output that cites nothing (hallucination guard) and falls back to extractive', async () => {
    const { pipeline } = await makePipeline({ llm: fakeLlm({ used_source_ids: [] }) });
    const r = await pipeline.handle({ ...base, language: 'en', message: 'Do I have to wear a helmet when riding a motorcycle?' });
    expect(r.generation_mode).toBe('extractive');
    expect(r.sources[0].id).toBe('ln-010');
  });

  it('falls back to extractive mode when the LLM errors', async () => {
    const { pipeline } = await makePipeline({ llm: fakeLlm(new Error('HTTP 500')) });
    const r = await pipeline.handle({ ...base, language: 'en', message: 'Do I have to wear a helmet when riding a motorcycle?' });
    expect(r.generation_mode).toBe('extractive');
    expect(r.fallback_used).toBe(false);
  });

  it('keeps conversation history for short follow-ups', async () => {
    const { pipeline } = await makePipeline();
    const first = await pipeline.handle({ ...base, language: 'en', message: 'Do I have to wear a helmet when riding a motorcycle?' });
    const follow = await pipeline.handle({ ...base, language: 'en', message: 'And my passenger?', conversation_id: first.conversation_id });
    expect(follow.conversation_id).toBe(first.conversation_id);
    expect(follow.sources[0]?.id).toBe('ln-010');
  });
});

describe('validateDraft', () => {
  const ctx = [{ chunk: { why: 'w', actions: ['a'] } as never, score: 0.9 }];

  it('drops citations that point outside the retrieved context', () => {
    expect(validateDraft({ answer: 'Wear the helmet when riding.', why_it_matters: '', recommended_actions: [], used_source_ids: ['S7'], category: null, uncertainty_note: null }, ctx, 'en')).toBeNull();
  });

  it('rejects answers in the wrong language', () => {
    expect(validateDraft({ answer: 'Anda harus memakai helm saat berkendara di jalan.', why_it_matters: '', recommended_actions: [], used_source_ids: ['S1'], category: null, uncertainty_note: null }, ctx, 'en')).toBeNull();
  });

  it('accepts a grounded answer in the right language', () => {
    expect(validateDraft({ answer: 'You should wear a helmet when riding.', why_it_matters: '', recommended_actions: [], used_source_ids: ['S1'], category: 'traffic', uncertainty_note: null }, ctx, 'en')).not.toBeNull();
  });
});
