import { describe, expect, it } from 'vitest';
import { systemPrompt } from '../src/rag/prompts.js';

describe('system prompt', () => {
  it('keeps the grounding rules next to the conversational style rules', () => {
    for (const lang of ['en', 'id'] as const) {
      const p = systemPrompt(lang);
      expect(p).toMatch(/Use ONLY the facts in the SOURCES block/);
      expect(p).toMatch(/Never invent or generalise customary/);
      expect(p).toMatch(/Never describe a source as verified/);
      expect(p).toMatch(/First sentence: answer the actual question directly/);
      expect(p).toMatch(/No article numbers, page numbers, source ids/);
    }
    expect(systemPrompt('id')).toMatch(/Write in Bahasa Indonesia only/);
    expect(systemPrompt('en')).toMatch(/Write in English only/);
  });
});
