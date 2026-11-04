import { config } from '../config.js';
import { CATEGORIES } from '../types.js';
import { z } from 'zod';

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

const sumopodDraftSchema = z.object({
  answer: z.string().trim().min(1),
  why_it_matters: z.string(),
  recommended_actions: z.array(z.string()).max(6),
  used_source_ids: z.array(z.string()).max(10),
  category: z.string().nullable().optional().default(null),
  uncertainty_note: z.string().nullable().optional().default(null),
});

export class SumoPodClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model = config.sumopodModel,
    private readonly timeoutMs = config.llmTimeoutMs,
    private readonly baseUrl = config.sumopodBaseUrl,
  ) {}

  get id() {
    return `sumopod:${this.model}`;
  }

  async generate(system: string, user: string): Promise<LlmDraft> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'system', content: `${system}\n\nReturn a single JSON object. category must be one of: ${CATEGORIES.join(', ')}, or null. uncertainty_note must be a string or null. All other fields are required: answer and why_it_matters are strings; recommended_actions and used_source_ids are arrays of strings.` }, { role: 'user', content: user }],
          temperature: 0.2,
          max_tokens: 1800,
          response_format: { type: 'json_object' },
          stream: false,
        }),
      });
      if (!res.ok) throw new LlmError(`SumoPod request failed with HTTP ${res.status}`, res.status);
      const json = await res.json() as {
        choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
      };
      const choice = json.choices?.[0];
      if (choice?.finish_reason !== 'stop' || choice.message?.refusal) {
        throw new LlmError('SumoPod returned an incomplete or refused response');
      }
      const content = choice.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new LlmError('SumoPod returned an empty response');
      const parsed = sumopodDraftSchema.safeParse(JSON.parse(content));
      if (!parsed.success) {
        const fields = parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.code}`).join(', ');
        throw new LlmError(`SumoPod returned an invalid answer structure (${fields})`);
      }
      return parsed.data;
    } catch (err) {
      if (err instanceof LlmError) throw err;
      if (ctrl.signal.aborted) throw new LlmError('SumoPod request timed out');
      throw new LlmError('SumoPod request failed or returned invalid JSON');
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createLlm(): LlmClient | null {
  if (config.llmProvider === 'sumopod') {
    if (!config.sumopodApiKey) throw new LlmError('LLM_PROVIDER=sumopod requires SUMOPOD_API_KEY');
    return new SumoPodClient(config.sumopodApiKey);
  }
  if (config.llmProvider === 'gemini' && config.geminiApiKey) return new GeminiClient(config.geminiApiKey);
  return null;
}
