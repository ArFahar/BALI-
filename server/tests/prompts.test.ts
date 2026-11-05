import { describe, expect, it } from 'vitest';
import { systemPrompt } from '../src/rag/prompts.js';

describe('system prompt', () => {
  it('keeps the grounding rules next to the conversational style rules', () => {
    for (const lang of ['en', 'id'] as const) {
      const p = systemPrompt(lang);
      expect(p).toMatch(/they are the primary basis\. Never contradict them/);
      expect(p).toMatch(/Never invent or generalise customary/);
      expect(p).toMatch(/Never describe a source as verified/);
      expect(p).toMatch(/never conclude that something is permitted because no prohibition was found/);
      expect(p).toMatch(/never fabricate sources or citations/i);
      expect(p).toMatch(/First sentence: answer the actual question directly/);
      expect(p).toMatch(/No article numbers, page numbers, source ids/);
    }
    expect(systemPrompt('id')).toMatch(/Write in Bahasa Indonesia only/);
    expect(systemPrompt('en')).toMatch(/Write in English only/);
    // The risk level is set by the system and changes what general knowledge may do.
    expect(systemPrompt('en', 'high')).toMatch(/QUESTION RISK .*HIGH - .*General knowledge must NOT decide it/s);
    expect(systemPrompt('en', 'low')).toMatch(/QUESTION RISK .*LOW - /s);
  });
});
