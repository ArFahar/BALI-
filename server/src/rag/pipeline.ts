import crypto from 'node:crypto';
import type {
  Applicability,
  Category,
  ChatResponse,
  Claim,
  ClaimBasis,
  Confidence,
  KbChunk,
  Language,
  Quote,
  RetrievalStatus,
  RiskLevel,
  ScoredChunk,
  SourceRef,
  SourceType,
  UserType,
} from '../types.js';
import { CATEGORIES } from '../types.js';
import { SCOPES_FOR_CANGGU, type KbStore } from '../kb/store.js';
import { classify, detectLanguage, type Classification } from './classifier.js';
import type { Embedder } from './embeddings.js';
import type { LlmClient, LlmDraft } from './llm.js';
import { msg, sourceFrame } from './messages.js';
import { systemPrompt, userPrompt } from './prompts.js';
import { assessRisk } from './risk.js';
import { glossaryTerms, type QueryTranslator } from './translator.js';

export interface PipelineDeps {
  store: KbStore;
  embedder: Embedder;
  translator: QueryTranslator | null;
  llm: LlmClient | null;
  topK: number;
  minScore: number;
  strongScore: number;
  /** Minimum similarity for a chunk whose category the classifier did not detect. */
  standaloneScore: number;
  logger?: Pick<Console, 'warn'>;
  /** Debug hook (retrieval audit): receives each stage's intermediate data. Never set in production wiring. */
  trace?: (stage: 'retrieval' | 'generation', data: Record<string, unknown>) => void;
}

export interface ChatRequest {
  message: string;
  language: Language;
  user_type: UserType;
  location: 'canggu';
  conversation_id?: string;
}

/** Applicability labels that address each kind of user (tamiu = non-members of the customary village, incl. foreigners). */
export const APPLIES_TO_USER: Record<UserType, Applicability[]> = {
  tourist: ['everyone', 'foreign_tourist', 'domestic_tourist', 'tamiu'],
  newcomer: ['everyone', 'foreign_tourist', 'tamiu', 'krama_tamiu'],
};
/** Small ranking penalty for provisions not addressed to the user; they stay available as context. */
const NOT_APPLICABLE_PENALTY = 0.015;
/** Background (definitions) should not outrank an actual rule of similar relevance. */
const CONTEXT_PENALTY = 0.01;

/** Question asks for a penalty / text actually states one. */
const ASKS_SANCTION = /\b(fines?|penalt\w*|sanctions?|punish\w*|denda|sanksi|hukuman|pamidanda)\b/i;
const SANCTION = /\b(denda|sanksi|danda|pamidanda|dikenakan|dikenai|pidana|fine|penalt\w*|sanction)\b/i;

const HISTORY_LIMIT = 6;
const MAX_CONVERSATIONS = 500;
const EXCERPT_CHARS = 1000;

/** Label class comes from system metadata, never from the LLM. */
const toApiSourceType = (c: KbChunk): SourceType =>
  c.source_type !== 'OFFICIAL' ? c.source_type : c.source_subtype === 'customary_law' ? 'CUSTOMARY_RULE' : 'OFFICIAL_REGULATION';

export class RagPipeline {
  private history = new Map<string, { role: 'user' | 'assistant'; text: string }[]>();

  constructor(private readonly deps: PipelineDeps) {}

  async handle(req: ChatRequest): Promise<ChatResponse> {
    const conversationId = req.conversation_id ?? crypto.randomUUID();
    const lang = req.language;
    const turns = this.history.get(conversationId) ?? [];

    // 1-2. Intent & context classification
    const cls = classify(req.message);
    if (cls.mentionsOutsideBali) {
      return this.remember(conversationId, req.message, {
        ...this.fallbackBase(conversationId, lang, 'OUT_OF_SCOPE', cls.category, null),
        answer: msg('outsideBali', lang)(capitalise(cls.mentionsOutsideBali)),
      });
    }

    // 3. Query processing: short follow-ups borrow the previous question; translate for cross-lingual retrieval.
    const lastUser = [...turns].reverse().find((t) => t.role === 'user');
    const query = lastUser && req.message.trim().split(/\s+/).length < 5 ? `${lastUser.text} ${req.message}` : req.message;
    const queryLang: Language = cls.detectedLanguage ?? lang;
    const otherLang: Language = queryLang === 'en' ? 'id' : 'en';
    let translation: string | null = null;
    if (this.deps.translator) {
      try {
        translation = await this.deps.translator.translate(query, queryLang, otherLang);
      } catch (err) {
        this.deps.logger?.warn(`[translate] failed, searching with the original text only: ${(err as Error).message}`);
      }
    }
    const expanded = [translation, ...glossaryTerms(query, queryLang)].filter(Boolean).join(' ').trim();
    const detected = new Set<string>([...Object.keys(cls.categoryScores), ...Object.keys(classify(expanded).categoryScores)]);

    // 4. Retrieval: search with each query variant, keep the best score per chunk.
    const variants: { text: string; by: ScoredChunk['matched_by'] }[] = [{ text: query, by: 'original' }];
    if (expanded) variants.push({ text: expanded, by: 'translation' });
    const best = new Map<string, ScoredChunk>();
    for (const v of variants) {
      const embedding = await this.deps.embedder.embedQuery(v.text);
      const hits = await this.deps.store.search(embedding, { scopes: SCOPES_FOR_CANGGU, excludeStatuses: ['EXPIRED'] }, this.deps.topK * 2);
      for (const h of hits) {
        const prev = best.get(h.chunk.chunk_key);
        if (!prev || h.score > prev.score) best.set(h.chunk.chunk_key, { ...h, matched_by: v.by });
      }
    }

    // 5. Relevance filtering + applicability-aware ranking
    const context = this.filterRelevant([...best.values()], detected, req.user_type);
    this.deps.trace?.('retrieval', {
      query,
      query_language: queryLang,
      translation,
      expanded,
      detected_categories: [...detected],
      candidates: [...best.values()].sort((a, b) => b.score - a.score),
      context,
    });
    // 6. Reasoning controller inputs: question risk (backend rule, not the LLM's call).
    const risk = assessRisk(req.message, cls);
    const queryText = `${query} ${expanded}`;

    // 7. Generation. Without evidence the LLM is only asked when general knowledge is allowed for this risk level.
    const outcome =
      this.deps.llm && (context.length > 0 || risk !== 'high') ? await this.tryLlm(req, context, turns, queryText, risk) : null;

    const fallback = (status: RetrievalStatus, note: string | null = null) =>
      this.remember(conversationId, req.message, {
        ...this.fallbackBase(conversationId, lang, status, cls.category, translation, risk),
        answer: status === 'OFF_TOPIC' ? msg('offTopic', lang) : msg('noMatch', lang),
        recommended_actions: status === 'OFF_TOPIC' ? [] : [...msg('noMatchActions', lang)],
        caveats: unique([...this.flagCaveats(cls, lang, []), ...(note ? [note] : [])]),
      });

    if (outcome?.kind === 'out_of_scope') return fallback('OFF_TOPIC');
    if (outcome?.kind === 'abstain') return fallback('NO_MATCH', outcome.note);

    // General-knowledge answer: no retrieved source supports it, so no sources are shown and it is labelled.
    if (outcome?.kind === 'answer' && outcome.mode === 'general') {
      return this.remember(conversationId, req.message, {
        conversation_id: conversationId,
        answer: outcome.answer,
        why_it_matters: outcome.why,
        category: outcome.category ?? (cls.category as Category | null) ?? null,
        recommended_actions: outcome.actions,
        quote: null,
        sources: [],
        source_classification: [],
        caveats: unique([
          msg('generalKnowledge', lang),
          ...(risk === 'medium' ? [msg('localPracticeMayDiffer', lang)] : []),
          ...this.flagCaveats(cls, lang, []),
          ...(outcome.uncertainty ? [outcome.uncertainty] : []),
        ]),
        retrieval_status: 'NO_MATCH',
        confidence: 'low',
        fallback_used: false,
        generation_mode: 'llm',
        language: lang,
        search_translation: translation,
        reasoning_mode: 'general',
        evidence_status: 'none',
        risk_level: risk,
        claims: outcome.claims,
      });
    }

    if (context.length === 0) {
      // On-topic without evidence: an etiquette category, a customary-rule request, or a high-risk (legal / ritual) question.
      return fallback(cls.category || cls.asksCustomaryRule || risk === 'high' ? 'NO_MATCH' : 'OFF_TOPIC');
    }

    // Grounded / hybrid LLM answer, or the deterministic extractive answer (no LLM, or LLM failed validation).
    const generated =
      outcome?.kind === 'answer' ? outcome : { ...this.extractive(context, lang, queryText), mode: 'grounded' as const, claims: [] as Claim[] };
    const mode = outcome?.kind === 'answer' ? 'llm' : 'extractive';

    const used = generated.used;
    const topScore = context[0].score;
    const retrievalStatus: RetrievalStatus = topScore >= this.deps.strongScore ? 'MATCHED' : 'WEAK_MATCH';
    const allVerified = used.every((u) => u.chunk.validation_status === 'VERIFIED');
    const confidence: Confidence =
      generated.mode === 'hybrid' ? 'low' : retrievalStatus === 'MATCHED' ? (allVerified ? 'high' : 'medium') : 'low';
    const caveats = [
      ...(retrievalStatus === 'WEAK_MATCH' ? [msg('weakMatch', lang)] : []),
      ...(generated.mode === 'hybrid' ? [msg('hybridNote', lang)] : []),
      ...this.flagCaveats(cls, lang, used),
      ...this.sourceCaveats(used, req.user_type, lang, mode === 'extractive' && generated.quote !== null && generated.quote.language !== lang),
      // Asked for a fine/sanction, but the passage shown states none: say so instead of implying it answers.
      ...(ASKS_SANCTION.test(`${req.message} ${expanded}`) && !SANCTION.test(generated.quote?.text ?? used.map((u) => u.chunk.content).join(' '))
        ? [msg('sanctionNotStated', lang)]
        : []),
      ...(mode === 'llm' ? [msg('llmSummary', lang)] : []),
      ...(generated.uncertainty ? [generated.uncertainty] : []),
    ];

    return this.remember(conversationId, req.message, {
      conversation_id: conversationId,
      answer: generated.answer,
      why_it_matters: generated.why,
      category: generated.category ?? used[0]?.chunk.category ?? (cls.category as Category | null) ?? null,
      recommended_actions: generated.actions,
      quote: generated.quote,
      sources: used.map(toSourceRef),
      source_classification: unique(used.map((u) => toApiSourceType(u.chunk))),
      caveats: unique(caveats),
      retrieval_status: retrievalStatus,
      confidence,
      fallback_used: false,
      generation_mode: mode,
      language: lang,
      search_translation: translation,
      reasoning_mode: generated.mode,
      evidence_status: generated.mode === 'grounded' && retrievalStatus === 'MATCHED' ? 'sufficient' : 'partial',
      risk_level: risk,
      claims: generated.claims,
    });
  }

  private filterRelevant(raw: ScoredChunk[], detected: Set<string>, userType: UserType): ScoredChunk[] {
    // Multilingual-e5 scores are compressed (unrelated questions still score ~0.82), so similarity alone cannot reject
    // off-topic queries: a chunk must clear the floor AND agree with the keyword classifier, or be very similar.
    const allowed = new Set(APPLIES_TO_USER[userType]);
    const kept = raw
      .filter((r) => r.score >= this.deps.minScore && (detected.has(r.chunk.category) || r.score >= this.deps.standaloneScore))
      .map((r) => ({
        r,
        rank:
          r.score -
          (r.chunk.applicable_to.some((a) => allowed.has(a)) ? 0 : NOT_APPLICABLE_PENALTY) -
          (r.chunk.category === 'customary_context' ? CONTEXT_PENALTY : 0),
      }))
      .sort((a, b) => b.rank - a.rank);
    if (!kept.length) return [];
    const top = kept[0].rank;
    return kept.filter((k, i) => i === 0 || k.rank >= top - 0.03).slice(0, 3).map((k) => k.r);
  }

  private async tryLlm(
    req: ChatRequest,
    context: ScoredChunk[],
    history: { role: 'user' | 'assistant'; text: string }[],
    queryText: string,
    risk: RiskLevel,
  ): Promise<LlmOutcome | null> {
    try {
      const user = userPrompt({ message: req.message, userType: req.user_type, context, history });
      const draft = await this.deps.llm!.generate(systemPrompt(req.language, risk), user);
      const outcome = controlDraft(draft, context, req.language, risk);
      this.deps.trace?.('generation', {
        user_prompt: user,
        risk,
        proposed_mode: draft?.reasoning_mode ?? null,
        used_source_ids: draft?.used_source_ids,
        claims: draft?.claims,
        answer: draft?.answer,
        uncertainty_note: draft?.uncertainty_note,
        decided: outcome ? (outcome.kind === 'answer' ? outcome.mode : outcome.kind) : 'rejected',
      });
      if (!outcome) {
        this.deps.logger?.warn('[llm] draft rejected by validation (no valid citation or wrong language), using extractive answer');
        return null;
      }
      if (outcome.kind !== 'answer') this.deps.logger?.warn(`[llm] reasoning controller: ${outcome.kind} (risk ${risk})`);
      if (outcome.kind === 'answer' && outcome.mode !== 'general') {
        // The LLM paraphrases (and may translate) the rule; show the verbatim passage of the first cited legal source
        // next to it so the user can check the summary against the original text.
        const legal = outcome.used.find((u) => u.chunk.source_subtype !== 'research_summary');
        outcome.quote = legal
          ? { text: selectSentences(bodyOf(legal.chunk.content), queryText, EXCERPT_CHARS), language: legal.chunk.language, source_id: legal.chunk.chunk_key }
          : null;
      }
      return outcome;
    } catch (err) {
      this.deps.logger?.warn(`[llm] generation failed, using extractive answer: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Deterministic, fully grounded answer from the best chunk (used without an LLM). Rule text is never paraphrased
   * or machine-translated: it is quoted verbatim; only the framing sentence is written in the user's language.
   */
  private extractive(context: ScoredChunk[], lang: Language, queryText: string) {
    const top = context[0];
    const c = top.chunk;
    const body = c.content.split('\n').slice(1).join('\n').trim();
    const sameLang = c.language === lang;

    if (c.source_subtype === 'research_summary') {
      const s = markdownSections(body);
      const summary = [s.definition, s['cultural context']].filter(Boolean).join(' ');
      if (sameLang) {
        const doList = (s.do ?? '').split('\n').map(stripBullet).filter(Boolean);
        const dontList = (s["don't"] ?? '').split('\n').map(stripBullet).filter(Boolean);
        return {
          answer: clip(summary || body, EXCERPT_CHARS),
          why: s.significance ? clip(s.significance, 400) : null,
          actions: [...doList.slice(0, 3), ...dontList.slice(0, 2).map((d) => `${lang === 'en' ? 'Avoid' : 'Hindari'}: ${lowerFirst(d)}`)],
          used: [top],
          category: c.category,
          quote: null as Quote | null,
          uncertainty: null as string | null,
        };
      }
      return {
        answer: sourceFrame(c, lang),
        why: null,
        actions: [],
        used: [top],
        category: c.category,
        quote: { text: clip(summary || body, EXCERPT_CHARS), language: c.language, source_id: c.chunk_key },
        uncertainty: null as string | null,
      };
    }

    const excerpt = selectSentences(body, queryText, EXCERPT_CHARS);
    return {
      answer: sourceFrame(c, lang),
      why: null,
      // The rule itself is in the verbatim quote; restating it as bullets risked fragments that lose conditions.
      actions: c.source_subtype === 'customary_law' ? [msg('confirmLocally', lang)] : [],
      used: [top],
      category: c.category,
      quote: { text: excerpt, language: c.language, source_id: c.chunk_key },
      uncertainty: null as string | null,
    };
  }

  private flagCaveats(cls: Classification, lang: Language, used: ScoredChunk[]): string[] {
    const out: string[] = [];
    if (cls.mentionsOtherBaliArea) out.push(msg('otherBaliArea', lang)(capitalise(cls.mentionsOtherBaliArea)));
    if (cls.asksCustomaryRule && !used.some((u) => u.chunk.source_subtype === 'customary_law')) out.push(msg('customaryNotFound', lang));
    if (cls.fabricationAttempt) out.push(msg('fabricationRefused', lang));
    return out;
  }

  private sourceCaveats(used: ScoredChunk[], userType: UserType, lang: Language, quotedOtherLanguage: boolean): string[] {
    const out: string[] = [];
    const allowed = new Set(APPLIES_TO_USER[userType]);
    const flags = new Set(used.flatMap((u) => u.chunk.flags));
    if (used.some((u) => u.chunk.validation_status !== 'VERIFIED')) out.push(msg('notVerified', lang));
    if (used.every((u) => u.chunk.location_scope !== 'canggu')) out.push(msg('provinceWide', lang));
    for (const u of used) {
      if (u.chunk.applicable_to.some((a) => allowed.has(a))) continue;
      if (u.chunk.applicable_to.includes('krama_adat') || u.chunk.applicable_to.includes('krama_tamiu')) out.push(msg('kramaOnly', lang));
      else if (u.chunk.applicable_to.includes('business')) out.push(msg('businessOnly', lang));
    }
    if (userType === 'newcomer' && used.some((u) => u.chunk.applicable_to.includes('foreign_tourist'))) out.push(msg('foreignTouristOnlyNewcomer', lang));
    if (flags.has('UNOFFICIAL_TRANSLATION')) out.push(msg('unofficialTranslation', lang));
    if (flags.has('HISTORICAL_2022_AGREEMENT')) out.push(msg('historical2022', lang));
    if (flags.has('OCR_TEXT')) out.push(msg('ocrText', lang));
    if (used.some((u) => u.chunk.source_subtype === 'customary_law')) out.push(msg('customaryConfirm', lang));
    if (quotedOtherLanguage) out.push(msg('quotedInOtherLanguage', lang));
    return out;
  }

  private fallbackBase(
    conversationId: string,
    lang: Language,
    status: RetrievalStatus,
    category: Category | null,
    translation: string | null,
    risk: RiskLevel = 'medium',
  ): ChatResponse {
    return {
      conversation_id: conversationId,
      answer: '',
      why_it_matters: null,
      category,
      recommended_actions: [],
      quote: null,
      sources: [],
      source_classification: [],
      caveats: [],
      retrieval_status: status,
      confidence: 'none',
      fallback_used: true,
      generation_mode: 'fallback',
      language: lang,
      search_translation: translation,
      reasoning_mode: 'abstain',
      evidence_status: 'none',
      risk_level: risk,
      claims: [],
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
  if (used.length === 0) return null; // ungrounded answer -> reject
  const detected = detectLanguage(draft.answer);
  if (detected && detected !== lang) return null;
  const actions = (Array.isArray(draft.recommended_actions) ? draft.recommended_actions : [])
    .filter((a) => typeof a === 'string' && a.trim())
    .slice(0, 6);
  return {
    answer: draft.answer.trim(),
    why: typeof draft.why_it_matters === 'string' && draft.why_it_matters.trim() ? draft.why_it_matters.trim() : null,
    actions,
    used,
    category: (CATEGORIES as readonly string[]).includes(draft.category ?? '') ? (draft.category as Category) : null,
    uncertainty: typeof draft.uncertainty_note === 'string' && draft.uncertainty_note.trim() ? draft.uncertainty_note.trim() : null,
  };
}

// ---------------------------------------------------------------- text helpers

function markdownSections(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  let key = '_';
  for (const line of md.split('\n')) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      key = h[1].trim().toLowerCase();
      continue;
    }
    out[key] = out[key] ? `${out[key]}\n${line}` : line;
  }
  return out;
}

const STOP = new Set(
  'yang dan atau untuk dengan dalam pada dari ini itu ada adalah saya apakah bagaimana bisa boleh harus akan the and for with that this what how can should does need have from are you your about into when there'.split(' '),
);
const NORMATIVE = /\b(wajib|dilarang|tidak boleh|harus|sanksi|denda|must|required|prohibited|not allowed|fine)\b/i;

/**
 * Choose the most relevant CONTIGUOUS passage of the article (whole sentences, source order).
 * Picking scattered sentences was rejected: it dropped exceptions such as "tidak boleh menyalakan api, kecuali: ..."
 * and changed the meaning of the rule. Short articles are returned whole; cuts are marked with "…".
 */
export function selectSentences(body: string, queryText: string, maxChars: number): string {
  if (body.length <= maxChars) return body;
  const terms = [...new Set(queryText.toLowerCase().match(/[\p{L}-]{4,}/gu) ?? [])].filter((t) => !STOP.has(t));
  // Split after "." or ";" but never inside an enumeration: not after a list marker ("a.", "2.") and not before
  // the next item ("; b. ..."), so "kecuali: a. ...; b. ..." always stays together.
  const sentences = body
    .split(/(?<=[.;])(?<!(?:^|\s)[a-z0-9]{1,2}\.)\s+(?![a-z0-9]{1,2}\.\s)|\n|\s(?=•)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const weight = sentences.map((s) => {
    const low = s.toLowerCase();
    const hits = terms.filter((t) => low.includes(t.slice(0, Math.max(4, t.length - 2)))).length + (NORMATIVE.test(s) ? 0.5 : 0);
    return hits || -0.25; // irrelevant sentences cost a little, so windows don't pad with them
  });
  let bestStart = 0;
  let bestEnd = 0;
  let bestScore = -1;
  for (let start = 0; start < sentences.length; start++) {
    let len = 0;
    let score = 0;
    let end = start;
    while (end < sentences.length && len + sentences[end].length + 1 <= maxChars) {
      len += sentences[end].length + 1;
      score += weight[end];
      end++;
    }
    if (end === start) end = start + 1; // a single over-long sentence: keep it whole rather than cut it
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
      bestEnd = end;
    }
  }
  const passage = sentences.slice(bestStart, bestEnd).join(' ');
  return `${bestStart > 0 ? '… ' : ''}${passage}${bestEnd < sentences.length ? ' …' : ''}`;
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

const stripBullet = (s: string) => s.replace(/^\s*[-*•]\s*/, '').trim();
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function toSourceRef({ chunk, score }: ScoredChunk): SourceRef {
  return {
    id: chunk.chunk_key,
    title: chunk.context_header,
    document_title: chunk.document_title,
    source_name: chunk.publisher ? `${chunk.document_title} — ${chunk.publisher}` : chunk.document_title,
    source_url: chunk.source_url,
    source_type: toApiSourceType(chunk),
    validation_status: chunk.validation_status,
    effective_date: chunk.effective_date,
    location: chunk.location_scope,
    applies_to: chunk.applicable_to,
    articles: chunk.articles,
    page_number: chunk.page_number,
    page_ref_type: chunk.page_ref_type,
    language: chunk.language,
    flags: chunk.flags,
    is_demo_data: false,
    relevance: Math.round(score * 1000) / 1000,
  };
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function capitalise(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Chunk text without its first line (the context header). */
function bodyOf(content: string): string {
  return content.split('\n').slice(1).join('\n').trim();
}

// ---------------------------------------------------------------- reasoning controller

type LlmOutcome =
  | {
      kind: 'answer';
      mode: 'grounded' | 'hybrid' | 'general';
      answer: string;
      why: string | null;
      actions: string[];
      used: ScoredChunk[];
      category: Category | null;
      uncertainty: string | null;
      quote: Quote | null;
      claims: Claim[];
    }
  | { kind: 'abstain'; note: string | null }
  | { kind: 'out_of_scope' };

const BASES: readonly ClaimBasis[] = ['source', 'general_knowledge', 'inference'];
const sourceIndex = (id: unknown, n: number) => {
  const m = /^S?(\d+)$/i.exec(String(id).trim());
  const i = m ? Number(m[1]) - 1 : -1;
  return i >= 0 && i < n ? i : -1;
};

/**
 * Layers 3 + 5: decide the reasoning mode from what the draft can actually prove, not from what it declares.
 * - Source claims must cite retrieved sources; a "source" claim without a valid citation is relabelled "inference".
 * - grounded = only source claims; hybrid = sources plus general/inference; general = no valid citation and the model
 *   explicitly chose general/hybrid; anything else without citations is an abstention (prompt rule 5).
 * - High-risk questions are never answered from general knowledge alone.
 * Returns null when the draft is unusable (empty, wrong language) so the caller falls back to the extractive answer.
 */
export function controlDraft(draft: LlmDraft, context: ScoredChunk[], lang: Language, risk: RiskLevel): LlmOutcome | null {
  if (!draft) return null;
  const proposed = typeof draft.reasoning_mode === 'string' ? draft.reasoning_mode.trim().toLowerCase() : null;
  const note = typeof draft.uncertainty_note === 'string' && draft.uncertainty_note.trim() ? draft.uncertainty_note.trim() : null;
  if (proposed === 'out_of_scope') return { kind: 'out_of_scope' };
  if (proposed === 'abstain') return { kind: 'abstain', note };
  if (typeof draft.answer !== 'string' || draft.answer.trim().length < 10) return null;
  const detected = detectLanguage(draft.answer);
  if (detected && detected !== lang) return null;

  const cited = new Set<number>();
  for (const id of Array.isArray(draft.used_source_ids) ? draft.used_source_ids : []) {
    const i = sourceIndex(id, context.length);
    if (i >= 0) cited.add(i);
  }
  const claims: Claim[] = (Array.isArray(draft.claims) ? draft.claims : [])
    .filter((c) => c && typeof c.text === 'string' && c.text.trim())
    .slice(0, 8)
    .map((c) => {
      const idx = (Array.isArray(c.source_ids) ? c.source_ids : []).map((id) => sourceIndex(id, context.length)).filter((i) => i >= 0);
      idx.forEach((i) => cited.add(i));
      let basis: ClaimBasis = (BASES as readonly string[]).includes(c.basis) ? (c.basis as ClaimBasis) : 'inference';
      if (basis === 'source' && idx.length === 0) basis = 'inference';
      return { text: c.text.trim(), basis, source_ids: basis === 'source' ? unique(idx).map((i) => context[i].chunk.chunk_key) : [] };
    });

  // Citations that point outside the retrieved set are fabricated: reject the draft (extractive fallback).
  const rawIds = [
    ...(Array.isArray(draft.used_source_ids) ? draft.used_source_ids : []),
    ...(Array.isArray(draft.claims) ? draft.claims.flatMap((c) => (Array.isArray(c?.source_ids) ? c.source_ids : [])) : []),
  ];
  if (rawIds.some((id) => sourceIndex(id, context.length) < 0)) return null;
  const used = [...cited].sort((a, b) => a - b).map((i) => context[i]);
  const hasGeneral = claims.some((c) => c.basis !== 'source') || proposed === 'hybrid' || proposed === 'general';
  let mode: 'grounded' | 'hybrid' | 'general';
  if (used.length) mode = hasGeneral ? 'hybrid' : 'grounded';
  else if (proposed === 'general' || proposed === 'hybrid') mode = 'general';
  else return { kind: 'abstain', note }; // no citations and no explicit general answer: the sources do not answer it
  if (mode === 'general' && risk === 'high') return { kind: 'abstain', note };

  const actions = (Array.isArray(draft.recommended_actions) ? draft.recommended_actions : [])
    .filter((a) => typeof a === 'string' && a.trim())
    .slice(0, 6);
  return {
    kind: 'answer',
    mode,
    answer: draft.answer.trim(),
    why: typeof draft.why_it_matters === 'string' && draft.why_it_matters.trim() ? draft.why_it_matters.trim() : null,
    actions,
    used: mode === 'general' ? [] : used,
    category: (CATEGORIES as readonly string[]).includes(draft.category ?? '') ? (draft.category as Category) : null,
    uncertainty: note,
    quote: null,
    claims,
  };
}
