import crypto from 'node:crypto';
import type {
  Category,
  ChatResponse,
  Confidence,
  DocumentScope,
  Language,
  RetrievalStatus,
  ScoredChunk,
  SourceRef,
  SourceType,
  UserType,
} from '../types.js';
import { CATEGORIES } from '../types.js';
import { classify, detectLanguage, type Classification } from './classifier.js';
import type { Embedder } from './embeddings.js';
import type { LlmClient, LlmDraft } from './llm.js';
import { msg } from './messages.js';
import { systemPrompt, userPrompt } from './prompts.js';
import type { VectorStore } from './vectorStore.js';

export interface PipelineDeps {
  store: VectorStore;
  embedder: Embedder;
  llm: LlmClient | null;
  topK: number;
  minScore: number;
  strongScore: number;
  /** Minimum similarity for a chunk whose category the classifier did not detect. */
  standaloneScore: number;
  logger?: Pick<Console, 'warn'>;
}

export interface ChatRequest {
  message: string;
  language: Language;
  user_type: UserType;
  location: 'canggu';
  conversation_id?: string;
}

/** Scopes that apply to a user located in Canggu (Canggu is in Badung regency, Bali, Indonesia). */
const SCOPES_FOR_LOCATION: Record<'canggu', DocumentScope[]> = {
  canggu: ['canggu', 'badung', 'bali', 'indonesia'],
};

const HISTORY_LIMIT = 6;
const MAX_CONVERSATIONS = 500;

export class RagPipeline {
  private history = new Map<string, { role: 'user' | 'assistant'; text: string }[]>();

  constructor(private readonly deps: PipelineDeps) {}

  async handle(req: ChatRequest): Promise<ChatResponse> {
    const conversationId = req.conversation_id ?? crypto.randomUUID();
    const lang = req.language;
    const turns = this.history.get(conversationId) ?? [];

    // 1–2. Intent & context classification
    const cls = classify(req.message);

    if (cls.mentionsOutsideBali) {
      return this.remember(conversationId, req.message, {
        ...this.fallbackBase(conversationId, lang, 'OUT_OF_SCOPE', cls.category),
        answer: msg('outsideBali', lang)(capitalise(cls.mentionsOutsideBali)),
      });
    }

    // 3. Query processing — short follow-ups borrow the previous user question for retrieval context.
    const lastUser = [...turns].reverse().find((t) => t.role === 'user');
    const query = lastUser && req.message.trim().split(/\s+/).length < 5 ? `${lastUser.text} ${req.message}` : req.message;

    // 4. Knowledge retrieval (language + location filter, expired docs excluded)
    const embedding = await this.deps.embedder.embedQuery(query);
    const raw = await this.deps.store.search(
      embedding,
      { language: lang, scopes: SCOPES_FOR_LOCATION[req.location], excludeStatuses: ['EXPIRED'] },
      this.deps.topK,
    );

    // 5. Relevance filtering
    const context = this.filterRelevant(raw, cls);

    if (context.length === 0) {
      // A request for customary rules is on-topic even when no etiquette keyword matched.
      const status: RetrievalStatus = cls.category || cls.asksCustomaryRule ? 'NO_MATCH' : 'OFF_TOPIC';
      return this.remember(conversationId, req.message, {
        ...this.fallbackBase(conversationId, lang, status, cls.category),
        answer: status === 'OFF_TOPIC' ? msg('offTopic', lang) : msg('noMatch', lang),
        recommended_actions: status === 'OFF_TOPIC' ? [] : [...msg('noMatchActions', lang)],
        caveats: this.flagCaveats(cls, lang),
      });
    }

    // 6–8. Generation, source attribution, response validation
    let generated = this.deps.llm ? await this.tryLlm(req, context, turns) : null;
    const mode = generated ? 'llm' : 'extractive';
    if (!generated) generated = this.extractive(context);

    const used = generated.used;
    const topScore = context[0].score;
    const retrievalStatus: RetrievalStatus = topScore >= this.deps.strongScore ? 'MATCHED' : 'WEAK_MATCH';
    const allVerified = used.every((u) => u.chunk.validation_status === 'VERIFIED');
    const confidence: Confidence =
      retrievalStatus === 'MATCHED' ? (allVerified ? 'high' : 'medium') : 'low';

    const caveats = [
      ...(retrievalStatus === 'WEAK_MATCH' ? [msg('weakMatch', lang)] : []),
      ...this.flagCaveats(cls, lang),
      ...this.sourceCaveats(used, req.user_type, lang),
      ...(generated.uncertainty ? [generated.uncertainty] : []),
    ];

    const category =
      generated.category ?? (used[0]?.chunk.category as Category | undefined) ?? cls.category ?? null;

    return this.remember(conversationId, req.message, {
      conversation_id: conversationId,
      answer: generated.answer,
      why_it_matters: generated.why,
      category,
      recommended_actions: generated.actions,
      sources: used.map(toSourceRef),
      source_classification: unique(used.map((u) => u.chunk.source_type)) as SourceType[],
      caveats: unique(caveats),
      retrieval_status: retrievalStatus,
      confidence,
      fallback_used: false,
      generation_mode: mode,
      language: lang,
    });
  }

  private filterRelevant(raw: ScoredChunk[], cls: Classification): ScoredChunk[] {
    // A chunk is relevant if it clears the similarity floor AND either its category agrees with the
    // keyword classifier or its similarity is high enough to stand on its own. Multilingual-e5 scores are
    // compressed (unrelated questions still score ~0.82), so similarity alone cannot reject off-topic queries.
    const detected = new Set(Object.keys(cls.categoryScores));
    const kept = raw.filter(
      (r) => r.score >= this.deps.minScore && (detected.has(r.chunk.category) || r.score >= this.deps.standaloneScore),
    );
    if (!kept.length) return [];
    // Keep chunks close to the best one; drop the long tail that would dilute the answer.
    const best = kept[0].score;
    return kept
      .filter((r, i) => i === 0 || r.score >= best - 0.03 || (cls.category && r.chunk.category === cls.category))
      .slice(0, 3);
  }

  private async tryLlm(
    req: ChatRequest,
    context: ScoredChunk[],
    history: { role: 'user' | 'assistant'; text: string }[],
  ) {
    try {
      const draft = await this.deps.llm!.generate(
        systemPrompt(req.language),
        userPrompt({ message: req.message, userType: req.user_type, context, history }),
      );
      return validateDraft(draft, context, req.language);
    } catch (err) {
      this.deps.logger?.warn(`[llm] generation failed, using extractive answer: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Deterministic, fully grounded answer quoted from the best document (used without an LLM).
   * Only that document is cited, so every cited source is one whose text actually appears in the answer.
   */
  private extractive(context: ScoredChunk[]) {
    const [top] = context;
    return {
      answer: top.chunk.content,
      why: top.chunk.why,
      actions: top.chunk.actions,
      used: [top],
      category: top.chunk.category,
      uncertainty: null as string | null,
    };
  }

  private flagCaveats(cls: Classification, lang: Language): string[] {
    const out: string[] = [];
    if (cls.mentionsOtherBaliArea) out.push(msg('otherBaliArea', lang)(capitalise(cls.mentionsOtherBaliArea)));
    if (cls.asksCustomaryRule) out.push(msg('customaryUnavailable', lang));
    if (cls.fabricationAttempt) out.push(msg('fabricationRefused', lang));
    return out;
  }

  private sourceCaveats(used: ScoredChunk[], userType: UserType, lang: Language): string[] {
    const out: string[] = [];
    if (used.some((u) => u.chunk.validation_status !== 'VERIFIED')) out.push(msg('notVerified', lang));
    if (used.some((u) => u.chunk.is_demo_data)) out.push(msg('demoData', lang));
    if (used.every((u) => u.chunk.location !== 'canggu')) out.push(msg('provinceWide', lang));
    if (userType === 'newcomer' && used.some((u) => u.chunk.applies_to.includes('foreign_tourist'))) {
      out.push(msg('foreignTouristOnlyNewcomer', lang));
    }
    return out;
  }

  private fallbackBase(
    conversationId: string,
    lang: Language,
    status: RetrievalStatus,
    category: Category | null,
  ): ChatResponse {
    return {
      conversation_id: conversationId,
      answer: '',
      why_it_matters: null,
      category,
      recommended_actions: [],
      sources: [],
      source_classification: [],
      caveats: [],
      retrieval_status: status,
      confidence: 'none',
      fallback_used: true,
      generation_mode: 'fallback',
      language: lang,
    };
  }

  private remember(conversationId: string, userText: string, res: ChatResponse): ChatResponse {
    const turns = this.history.get(conversationId) ?? [];
    turns.push({ role: 'user', text: userText }, { role: 'assistant', text: res.answer });
    this.history.delete(conversationId);
    this.history.set(conversationId, turns.slice(-HISTORY_LIMIT));
    if (this.history.size > MAX_CONVERSATIONS) this.history.delete(this.history.keys().next().value!);
    return res;
  }
}

/**
 * Response validation for LLM output: citations must point at retrieved sources,
 * the answer must be non-empty and in the requested language. Returns null to force the extractive path.
 */
export function validateDraft(draft: LlmDraft, context: ScoredChunk[], lang: Language) {
  if (!draft || typeof draft.answer !== 'string' || draft.answer.trim().length < 10) return null;
  const ids = Array.isArray(draft.used_source_ids) ? draft.used_source_ids : [];
  const used = unique(
    ids
      .map((id) => /^S?(\d+)$/i.exec(String(id).trim())?.[1])
      .filter((n): n is string => Boolean(n))
      .map((n) => Number(n) - 1)
      .filter((i) => i >= 0 && i < context.length),
  ).map((i) => context[i]);
  if (used.length === 0) return null; // ungrounded answer → reject
  const detected = detectLanguage(draft.answer);
  if (detected && detected !== lang) return null;
  const actions = (Array.isArray(draft.recommended_actions) ? draft.recommended_actions : [])
    .filter((a) => typeof a === 'string' && a.trim())
    .slice(0, 6);
  return {
    answer: draft.answer.trim(),
    why: typeof draft.why_it_matters === 'string' && draft.why_it_matters.trim() ? draft.why_it_matters.trim() : used[0].chunk.why,
    actions: actions.length ? actions : used[0].chunk.actions,
    used,
    category: (CATEGORIES as readonly string[]).includes(draft.category ?? '') ? (draft.category as Category) : null,
    uncertainty: typeof draft.uncertainty_note === 'string' && draft.uncertainty_note.trim() ? draft.uncertainty_note.trim() : null,
  };
}

function toSourceRef({ chunk, score }: ScoredChunk): SourceRef {
  return {
    id: chunk.doc_id,
    title: chunk.title,
    source_name: chunk.source_name,
    source_url: chunk.source_url,
    source_type: chunk.source_type,
    validation_status: chunk.validation_status,
    effective_date: chunk.effective_date,
    location: chunk.location,
    applies_to: chunk.applies_to,
    is_demo_data: chunk.is_demo_data,
    relevance: Math.round(score * 1000) / 1000,
  };
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function capitalise(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
