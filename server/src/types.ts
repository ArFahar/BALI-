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

export const CATEGORIES = [
  'neighborhood',
  'waste_management',
  'public_behavior',
  'religious_cultural',
  'sacred_place',
  'traffic',
  'social_interaction',
  'accommodation',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SOURCE_TYPES = ['OFFICIAL_REGULATION', 'COMMUNITY_VERIFIED', 'GENERAL_ADVISORY'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const VALIDATION_STATUSES = ['VERIFIED', 'UNVERIFIED', 'EXPIRED', 'UNDER_REVIEW'] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export type AppliesTo = 'everyone' | 'foreign_tourist';

/** One retrievable unit: a scenario in one language. */
export interface KnowledgeChunk {
  id: string; // `${doc_id}-${language}`
  doc_id: string;
  language: Language;
  title: string;
  content: string;
  why: string;
  actions: string[];
  category: Category;
  location: DocumentScope;
  applies_to: AppliesTo[];
  source_name: string;
  source_url: string | null;
  source_type: SourceType;
  validation_status: ValidationStatus;
  validated_by: string | null;
  effective_date: string | null;
  last_verified_at: string | null;
  is_demo_data: boolean;
  notes: string | null;
}

export interface ScoredChunk {
  chunk: KnowledgeChunk;
  score: number;
}

export interface RetrievalFilter {
  language: Language;
  scopes: DocumentScope[];
  excludeStatuses: ValidationStatus[];
}

export type RetrievalStatus = 'MATCHED' | 'WEAK_MATCH' | 'NO_MATCH' | 'OUT_OF_SCOPE' | 'OFF_TOPIC';
export type Confidence = 'high' | 'medium' | 'low' | 'none';
export type GenerationMode = 'llm' | 'extractive' | 'fallback';

export interface SourceRef {
  id: string;
  title: string;
  source_name: string;
  source_url: string | null;
  source_type: SourceType;
  validation_status: ValidationStatus;
  effective_date: string | null;
  location: DocumentScope;
  applies_to: AppliesTo[];
  is_demo_data: boolean;
  relevance: number;
}

export interface ChatResponse {
  conversation_id: string;
  answer: string;
  why_it_matters: string | null;
  category: Category | null;
  recommended_actions: string[];
  sources: SourceRef[];
  source_classification: SourceType[];
  caveats: string[];
  retrieval_status: RetrievalStatus;
  confidence: Confidence;
  fallback_used: boolean;
  generation_mode: GenerationMode;
  language: Language;
}
