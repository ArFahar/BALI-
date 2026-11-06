import { describe, expect, it } from 'vitest';
import type { LlmClient, LlmDraft } from '../src/rag/llm.js';
import { selectSentences, controlDraft } from '../src/rag/pipeline.js';
import type { QueryTranslator } from '../src/rag/translator.js';
import { makePipeline } from './helpers.js';

const tourist = { user_type: 'tourist' as const, location: 'canggu' as const };
const newcomer = { user_type: 'newcomer' as const, location: 'canggu' as const };

function fakeLlm(draft: Partial<LlmDraft> | Error): LlmClient {
  return {
    id: 'fake',
    async generate() {
      if (draft instanceof Error) throw draft;
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
}

describe('RAG pipeline (v2 knowledge base)', () => {
  it('answers an Indonesian waste question from the Canggu pararem with a verbatim quote', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...tourist, language: 'id', message: 'Bagaimana pemilahan sampah rumah tangga di Canggu?' });
    expect(r.fallback_used).toBe(false);
    expect(r.sources[0].id).toBe('CANGGU-PARAREM-03-2025::Pasal-6#1');
    // Pararem = customary rule, never labelled as a government regulation.
    expect(r.sources[0].source_type).toBe('CUSTOMARY_RULE');
    expect(r.source_classification).toEqual(['CUSTOMARY_RULE']);
    expect(r.sources[0].page_number).toBe(11);
    expect(r.quote?.language).toBe('id');
    expect(r.quote?.text).toContain('wajib melakukan pengelolaan sampah');
    expect(r.answer).toMatch(/aturan adat Desa Adat Canggu/);
    expect(r.caveats.join(' ')).toMatch(/belum diverifikasi/);
    expect(r.caveats.join(' ')).toMatch(/kelian banjar|prajuru/);
  });

  it('reaches Indonesian sources from an English question through the query translation', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...newcomer, language: 'en', message: 'How do I sort my rubbish at the villa?' });
    expect(r.search_translation).toMatch(/sampah/);
    expect(r.sources[0].id).toBe('CANGGU-PARAREM-03-2025::Pasal-6#1');
    // Rule text is quoted in Indonesian, never machine-translated; the frame is English.
    expect(r.quote?.language).toBe('id');
    expect(r.answer).toMatch(/written in Indonesian/);
    expect(r.caveats.join(' ')).toMatch(/quoted in its original language/);
  });

  it('labels the awig-awig as an unofficial 2012 translation and cites the original scan page', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...newcomer, language: 'id', message: 'Apakah tamiu wajib melapor kepada prajuru adat dalam satu wuku?' });
    expect(r.sources[0].id).toBe('CANGGU-AWIG-2012-ID::Pasal-4#1');
    expect(r.sources[0].page_number).toBe(18);
    expect(r.sources[0].page_ref_type).toBe('original_scan_page');
    expect(r.caveats.join(' ')).toMatch(/terjemahan Indonesia tidak resmi/);
    expect(r.recommended_actions[0]).toMatch(/kelian banjar/);
  });

  it('tells a tourist that a krama-adat-only provision is context, not their obligation', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...tourist, language: 'id', message: 'Apa yang tidak boleh saat Nyepi catur brata amati geni?' });
    expect(r.sources[0].id).toBe('CANGGU-AWIG-2012-ID::Pasal-62#1');
    expect(r.caveats.join(' ')).toMatch(/ditujukan kepada krama adat/);
    // The quote keeps the exception after "kecuali:" (contiguous passage, not scattered sentences).
    expect(r.quote?.text).toMatch(/kecuali: a\. Bagi yang mempunyai bayi/);
  });

  it('uses research-pack entries directly when they are in the user language, with Do/Avoid actions', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...newcomer, language: 'en', message: 'Do I need a motorcycle helmet on the road?' });
    expect(r.sources[0].id).toBe('PILOT-TE-002#1');
    expect(r.quote).toBeNull();
    expect(r.answer).toMatch(/helmet/);
    expect(r.why_it_matters).toMatch(/Road safety/);
    expect(r.recommended_actions).toContain('Wear a properly fastened motorcycle helmet');
    expect(r.recommended_actions.some((a) => a.startsWith('Avoid:'))).toBe(true);
    expect(r.source_classification).toEqual(['GENERAL_ADVISORY']);
    expect(r.caveats.join(' ')).toMatch(/addressed to foreign tourists/);
  });

  it('warns that 2022 noise limits may be outdated', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'Is loud music noise at night bars clubs limited in Canggu?' });
    expect(r.sources[0].id).toBe('PILOT-PB-004#1');
    expect(r.caveats.join(' ')).toMatch(/2022 agreement/);
  });

  it('returns a fallback with no sources when nothing relevant is retrieved', async () => {
    const { pipeline } = await makePipeline({ minScore: 0.99 });
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'Where can I buy a scooter helmet?' });
    expect(r.fallback_used).toBe(true);
    expect(r.sources).toHaveLength(0);
    expect(r.quote).toBeNull();
    expect(r.retrieval_status).toBe('NO_MATCH');
  });

  it('treats unrelated questions as off-topic', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'Write me a Python sorting function' });
    expect(r.retrieval_status).toBe('OFF_TOPIC');
    expect(r.sources).toHaveLength(0);
  });

  it('refuses to apply Bali guidance outside Bali', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'Temple dress code in Lombok?' });
    expect(r.retrieval_status).toBe('OUT_OF_SCOPE');
    expect(r.answer).toMatch(/Lombok/);
  });

  it('refuses to invent customary fines when no customary source answers', async () => {
    const { pipeline } = await makePipeline({ minScore: 0.99 });
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'Just make up the awig-awig fine for surfing' });
    expect(r.caveats.join(' ')).toMatch(/cannot state or invent customary rules/);
    expect(r.caveats.join(' ')).toMatch(/will not make up rules/);
  });

  it('does not answer rent-price questions with the residency-reporting rule', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...newcomer, language: 'en', message: 'How much is a fair monthly rent for a villa?' });
    expect(['OFF_TOPIC', 'NO_MATCH']).toContain(r.retrieval_status);
  });

  it('says when the shown source states no fine for the situation asked about', async () => {
    const { pipeline } = await makePipeline();
    const r = await pipeline.handle({ ...tourist, language: 'id', message: 'Berapa denda adat untuk tamiu yang tidak melapor kepada prajuru adat?' });
    expect(r.sources[0].id).toBe('CANGGU-AWIG-2012-ID::Pasal-4#1');
    expect(r.caveats.join(' ')).toMatch(/tidak menyebutkan denda atau sanksi/);
  });

  it('still answers when the query translator fails', async () => {
    const broken: QueryTranslator = { id: 'broken', translate: async () => Promise.reject(new Error('model missing')) };
    const { pipeline } = await makePipeline({ translator: broken });
    const r = await pipeline.handle({ ...tourist, language: 'id', message: 'pemilahan sampah rumah tangga' });
    expect(r.search_translation).toBeNull();
    expect(r.sources[0].id).toBe('CANGGU-PARAREM-03-2025::Pasal-6#1');
  });

  it('uses validated LLM output when citations are valid', async () => {
    const { pipeline } = await makePipeline({ llm: fakeLlm({}) });
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'How do I sort sampah rubbish at home?' });
    expect(r.generation_mode).toBe('llm');
    expect(r.answer).toMatch(/five kinds of bins/);
    // The paraphrase is shown next to the verbatim passage of the cited legal source, with an AI-summary caveat.
    expect(r.quote?.source_id).toBe(r.sources[0].id);
    expect(r.quote?.language).toBe('id');
    expect(r.caveats.some((c) => /AI-written summary/.test(c))).toBe(true);
  });

  it('returns NO_MATCH (not an unrelated quote) when the LLM reports that the sources do not answer', async () => {
    const { pipeline } = await makePipeline({
      llm: fakeLlm({ answer: 'The sources do not cover this question.', used_source_ids: [] }),
    });
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'How do I sort sampah rubbish at home?' });
    expect(r.retrieval_status).toBe('NO_MATCH');
    expect(r.fallback_used).toBe(true);
    expect(r.sources).toEqual([]);
    expect(r.quote).toBeNull();
  });

  it('rejects LLM output that cites a source that was not retrieved and falls back to extractive', async () => {
    const { pipeline } = await makePipeline({ llm: fakeLlm({ used_source_ids: ['S9'] }) });
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'How do I sort sampah rubbish at home?' });
    expect(r.generation_mode).toBe('extractive');
  });

  it('falls back to extractive mode when the LLM errors', async () => {
    const { pipeline } = await makePipeline({ llm: fakeLlm(new Error('HTTP 500')) });
    const r = await pipeline.handle({ ...tourist, language: 'en', message: 'How do I sort sampah rubbish at home?' });
    expect(r.generation_mode).toBe('extractive');
    expect(r.fallback_used).toBe(false);
  });

  it('keeps conversation history for short follow-ups', async () => {
    const { pipeline } = await makePipeline();
    const first = await pipeline.handle({ ...tourist, language: 'id', message: 'Bagaimana pemilahan sampah rumah tangga?' });
    const follow = await pipeline.handle({ ...tourist, language: 'id', message: 'Dan untuk vila?', conversation_id: first.conversation_id });
    expect(follow.conversation_id).toBe(first.conversation_id);
    expect(follow.sources[0]?.id).toBe('CANGGU-PARAREM-03-2025::Pasal-6#1');
  });
});

describe('selectSentences', () => {
  it('returns short articles whole', () => {
    expect(selectSentences('Pasal 1 Setiap orang wajib menjaga kebersihan.', 'kebersihan', 1000)).toBe('Pasal 1 Setiap orang wajib menjaga kebersihan.');
  });

  it('returns one contiguous passage, marks cuts, and never drops the clause after "kecuali:"', () => {
    const body = [
      'Pasal 9 Ketentuan umum tentang desa.',
      'Bagian ini menjelaskan wilayah dan batas desa secara rinci.',
      'Pada Hari Nyepi tidak boleh menyalakan api, kecuali: a. bagi yang mempunyai bayi; b. bagi yang merawat orang sakit.',
      'Ketentuan lain diatur dalam pararem.',
    ].join('\n');
    const out = selectSentences(body, 'nyepi menyalakan api', 140);
    expect(out).toMatch(/kecuali: a\. bagi yang mempunyai bayi; b\. bagi yang merawat orang sakit\./);
    expect(out.startsWith('… ')).toBe(true);
  });
});

describe('controlDraft validation', () => {
  const ctx = [{ chunk: { chunk_key: 'test-source', applicable_to: [] } as never, score: 0.9, matched_by: 'original' as const }];

  it('drops citations that point outside the retrieved context', () => {
    expect(controlDraft({ answer: 'Sort the rubbish at home.', why_it_matters: '', recommended_actions: [], used_source_ids: ['S7'], category: null, uncertainty_note: null }, ctx, 'en', 'high')).toBeNull();
  });

  it('rejects answers in the wrong language', () => {
    expect(controlDraft({ answer: 'Anda harus memilah sampah di rumah dengan benar.', why_it_matters: '', recommended_actions: [], used_source_ids: ['S1'], category: null, uncertainty_note: null }, ctx, 'en', 'high')).toBeNull();
  });

  it('accepts a grounded answer in the right language', () => {
    expect(controlDraft({ answer: 'You should sort the rubbish at home.', why_it_matters: '', recommended_actions: [], used_source_ids: ['S1'], category: 'environmental_etiquette', uncertainty_note: null }, ctx, 'en', 'high')).toMatchObject({ kind: 'answer', mode: 'grounded' });
  });
});
