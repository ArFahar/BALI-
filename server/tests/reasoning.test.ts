import { describe, expect, it } from 'vitest';
import { classify } from '../src/rag/classifier.js';
import type { LlmClient, LlmDraft } from '../src/rag/llm.js';
import { assessRisk } from '../src/rag/risk.js';
import { makePipeline } from './helpers.js';

const risk = (m: string) => assessRisk(m, classify(m));
const tourist = { user_type: 'tourist' as const, location: 'canggu' as const };

function llm(draft: Partial<LlmDraft>): LlmClient & { calls: number } {
  const c = {
    id: 'fake',
    calls: 0,
    async generate() {
      c.calls++;
      return {
        answer: 'Sort your household rubbish into five kinds of bins, as the Canggu pararem requires.',
        why_it_matters: 'It keeps the village clean.',
        recommended_actions: ['Separate organic and inorganic waste'],
        used_source_ids: ['S1'],
        category: 'environmental_etiquette',
        uncertainty_note: null,
        ...draft,
      };
    },
  };
  return c;
}

describe('risk policy (backend, not the LLM)', () => {
  it.each([
    ['Apakah saya boleh makan babi di upacara adat?', 'high'],
    ['Can I take photos during a temple ceremony?', 'high'],
    ['Berapa denda adat kalau berisik?', 'high'],
    ['Do I need a helmet on a scooter?', 'high'],
    ['How do I extend my tourist visa in Bali?', 'high'],
    ['Where can I exchange money at a good rate in Bali?', 'medium'],
    ['Apa perbedaan babi panggang dan babi guling?', 'low'],
    ['What is canang sari?', 'low'],
    ['Apa makanan khas Bali?', 'low'],
    ['How should I behave around my neighbours?', 'medium'],
  ])('%s -> %s', (m, expected) => expect(risk(m)).toBe(expected));
});

describe('reasoning controller', () => {
  it('grounded: only source claims with valid citations', async () => {
    const { pipeline } = await makePipeline({
      llm: llm({ reasoning_mode: 'grounded', claims: [{ text: 'Use five bins.', basis: 'source', source_ids: ['S1'] }] }),
    });
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'How do I sort sampah rubbish at home?' });
    expect(r.reasoning_mode).toBe('grounded');
    expect(r.claims).toEqual([{ text: 'Use five bins.', basis: 'source', source_ids: [r.sources[0].id] }]);
    expect(r.evidence_status).not.toBe('none');
  });

  it('hybrid: sources plus labelled general knowledge; a "source" claim without citation becomes inference', async () => {
    const { pipeline } = await makePipeline({
      llm: llm({
        reasoning_mode: 'grounded',
        claims: [
          { text: 'Use five bins.', basis: 'source', source_ids: ['S1'] },
          { text: 'Most villas provide bins.', basis: 'source', source_ids: [] },
        ],
      }),
    });
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'How do I sort sampah rubbish at home?' });
    expect(r.reasoning_mode).toBe('hybrid');
    expect(r.claims[1]).toMatchObject({ basis: 'inference', source_ids: [] });
    expect(r.evidence_status).toBe('partial');
    expect(r.caveats.some((c) => /general knowledge/.test(c))).toBe(true);
  });

  it('general: a low-risk question with no retrieved source may be answered from general knowledge, labelled, without sources', async () => {
    const fake = llm({
      answer: 'Babi guling is a whole spit-roasted pig, while roast pork usually means cuts roasted in an oven.',
      used_source_ids: [],
      reasoning_mode: 'general',
      claims: [{ text: 'Babi guling is spit-roasted whole.', basis: 'general_knowledge', source_ids: [] }],
    });
    const { pipeline } = await makePipeline({ llm: fake });
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'What is the difference between babi guling and roast pork?' });
    expect(r.reasoning_mode).toBe('general');
    expect(r.evidence_status).toBe('none');
    expect(r.sources).toEqual([]);
    expect(r.fallback_used).toBe(false);
    expect(r.caveats[0]).toMatch(/general knowledge, not on a source/);
  });

  it('abstain: a high-risk question is never answered from general knowledge, even if the LLM tries', async () => {
    const fake = llm({ answer: 'Yes, pork is usually fine at ceremonies in Bali.', used_source_ids: [], reasoning_mode: 'general' });
    const { pipeline } = await makePipeline({ llm: fake });
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'Am I allowed to eat pork at a temple ceremony?' });
    expect(r.reasoning_mode).toBe('abstain');
    expect(r.retrieval_status).toBe('NO_MATCH');
    expect(r.answer).not.toMatch(/pork is usually fine/);
  });

  it('abstain: no citations and no explicit general answer means the sources do not answer', async () => {
    const { pipeline } = await makePipeline({ llm: llm({ answer: 'The sources do not cover this question.', used_source_ids: [] }) });
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'How do I sort sampah rubbish at home?' });
    expect(r.reasoning_mode).toBe('abstain');
    expect(r.sources).toEqual([]);
  });

  it('out_of_scope from the LLM becomes OFF_TOPIC', async () => {
    const { pipeline } = await makePipeline({ llm: llm({ used_source_ids: [], reasoning_mode: 'out_of_scope' }) });
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'Write me a poem about the stock market' });
    expect(r.retrieval_status).toBe('OFF_TOPIC');
  });

  it('without an LLM nothing is answered from general knowledge', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'What is the difference between babi guling and roast pork?' });
    expect(r.reasoning_mode).toBe('abstain');
    expect(r.fallback_used).toBe(true);
  });
});
