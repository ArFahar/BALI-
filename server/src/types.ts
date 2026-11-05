export const LANGUAGES = ['en', 'id'] as const;
export type Language = (typeof LANGUAGES)[number];

export const USER_TYPES = ['tourist', 'newcomer'] as const;
export type UserType = (typeof USER_TYPES)[number];

/** Locations the user can select. The MVP pilot supports Canggu only. */
export const SUPPORTED_LOCATIONS = ['canggu'] as const;
export type SupportedLocation = (typeof SUPPORTED_LOCATIONS)[number];

/** Geographic scope a knowledge document applies to (narrowest first). */
export const DOCUMENT_SCOPES = ['canggu', 'badung', 'bali', 'indonesia'] as const;
export type DocumentScope = (typeof DOCUMENT_SCOPES)[number];

/** Knowledge categories of the v2 knowledge base (knowledge/pipeline stage 2). */
export const CATEGORIES = [
  'religious_etiquette',
  'sacred_places',
  'public_behavior',
  'neighborhood_etiquette',
  'environmental_etiquette',
  'traffic_etiquette',
  'social_interaction',
  'customary_context',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Source classes as stored in the database (knowledge-base design). */
export const KB_SOURCE_TYPES = ['OFFICIAL', 'COMMUNITY_VERIFIED', 'GENERAL_ADVISORY'] as const;
export type KbSourceType = (typeof KB_SOURCE_TYPES)[number];

/**
 * Source classes exposed by the API. OFFICIAL is split by subtype so the UI never calls a customary rule a government
 * regulation: government_regulation -> OFFICIAL_REGULATION, customary_law (awig-awig / pararem) -> CUSTOMARY_RULE.
 */
export const SOURCE_TYPES = ['OFFICIAL_REGULATION', 'CUSTOMARY_RULE', 'COMMUNITY_VERIFIED', 'GENERAL_ADVISORY'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const VALIDATION_STATUSES = ['VERIFIED', 'UNVERIFIED', 'EXPIRED', 'UNDER_REVIEW'] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/** Who a provision addresses (stage 2 applicability). */
export type Applicability =
  | 'everyone'
  | 'foreign_tourist'
  | 'domestic_tourist'
  | 'tamiu'
  | 'krama_tamiu'
  | 'krama_adat'
  | 'business';

/** One retrievable chunk with its document metadata joined in. */
export interface KbChunk {
  chunk_key: string;
  document_key: string;
  document_title: string;
  publisher: string | null;
  context_header: string;
  articles: string[];
  chapter: string | null;
  content: string;
  category: Category;
  location_scope: DocumentScope;
  applicable_to: Applicability[];
  source_type: KbSourceType;
  source_subtype: string | null;
  source_url: string | null;
  validation_status: ValidationStatus;
  effective_date: string | null;
  page_number: number | null;
  page_numbers: number[];
  page_ref_type: string | null;
  language: Language;
  flags: string[];
}

export interface ScoredChunk {
  chunk: KbChunk;
  score: number;
  /** Which query variant produced the best score: the user's text or its machine translation. */
  matched_by: 'original' | 'translation';
}

export interface RetrievalFilter {
  scopes: DocumentScope[];
  excludeStatuses: ValidationStatus[];
}

export type RetrievalStatus = 'MATCHED' | 'WEAK_MATCH' | 'NO_MATCH' | 'OUT_OF_SCOPE' | 'OFF_TOPIC';
export type Confidence = 'high' | 'medium' | 'low' | 'none';
export type GenerationMode = 'llm' | 'extractive' | 'fallback';

/**
 * How the answer was produced (decided by the backend reasoning controller, never taken from the LLM as is):
 * grounded = from retrieved sources only; hybrid = sources plus clearly labelled general knowledge;
 * general = general knowledge only (allowed for low/medium-risk questions); abstain = not answered.
 */
export type ReasoningMode = 'grounded' | 'hybrid' | 'general' | 'abstain';
/** Strength of the retrieved evidence for this answer (separate from how it was produced). */
export type EvidenceStatus = 'sufficient' | 'partial' | 'none';
/** Question risk: high = permission/obligation questions about rituals, sacred places, customary or state rules. */
export type RiskLevel = 'low' | 'medium' | 'high';
export type ClaimBasis = 'source' | 'general_knowledge' | 'inference';
export interface Claim {
  text: string;
  basis: ClaimBasis;
  /** Chunk keys supporting a source-based claim (validated against the retrieved context). */
  source_ids: string[];
}

export interface SourceRef {
  id: string;
  title: string;
  document_title: string;
  source_name: string;
  source_url: string | null;
  source_type: SourceType;
  validation_status: ValidationStatus;
  effective_date: string | null;
  location: DocumentScope;
  applies_to: Applicability[];
  articles: string[];
  page_number: number | null;
  page_ref_type: string | null;
  language: Language;
  flags: string[];
  is_demo_data: boolean;
  relevance: number;
}

/** Verbatim source text shown with the answer, always in the source's own language. */
export interface Quote {
  text: string;
  language: Language;
  source_id: string;
}

export interface ChatResponse {
  conversation_id: string;
  answer: string;
  why_it_matters: string | null;
  category: Category | null;
  recommended_actions: string[];
  quote: Quote | null;
  sources: SourceRef[];
  source_classification: SourceType[];
  caveats: string[];
  retrieval_status: RetrievalStatus;
  confidence: Confidence;
  fallback_used: boolean;
  generation_mode: GenerationMode;
  language: Language;
  /** Machine translation of the question used for retrieval (never shown as an answer). */
  search_translation: string | null;
  reasoning_mode: ReasoningMode;
  evidence_status: EvidenceStatus;
  risk_level: RiskLevel;
  /** Key statements of an LLM answer with their basis (empty for extractive answers and fallbacks). */
  claims: Claim[];
}
