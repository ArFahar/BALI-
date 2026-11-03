import { config } from '../config.js';
import { CATEGORIES } from '../types.js';

/** Structured output we ask the LLM for. Validated again in validator.ts. */
export interface LlmDraft {
  answer: string;
  why_it_matters: string;
  recommended_actions: string[];
  used_source_ids: string[];
  category: string | null;
  uncertainty_note: string | null;
}

export interface LlmClient {
  readonly id: string;
  generate(system: string, user: string): Promise<LlmDraft>;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    why_it_matters: { type: 'STRING' },
    recommended_actions: { type: 'ARRAY', items: { type: 'STRING' } },
    used_source_ids: { type: 'ARRAY', items: { type: 'STRING' } },
    category: { type: 'STRING', enum: [...CATEGORIES], nullable: true },
    uncertainty_note: { type: 'STRING', nullable: true },
  },
  required: ['answer', 'why_it_matters', 'recommended_actions', 'used_source_ids'],
};

export class LlmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export class GeminiClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model = config.geminiModel,
    private readonly timeoutMs = config.llmTimeoutMs,
  ) {}

  get id() {
    return `gemini:${this.model}`;
  }

  async generate(system: string, user: string): Promise<LlmDraft> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      });
      if (!res.ok) throw new LlmError(`Gemini request failed with HTTP ${res.status}`, res.status);
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new LlmError('Gemini returned an empty response');
      return JSON.parse(text) as LlmDraft;
    } catch (err) {
      if (err instanceof LlmError) throw err;
      throw new LlmError(err instanceof Error ? err.message : 'Unknown LLM error');
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createLlm(): LlmClient | null {
  if (config.llmProvider === 'gemini' && config.geminiApiKey) return new GeminiClient(config.geminiApiKey);
  return null;
}
