export type Language = 'en' | 'id';
export type UserType = 'tourist' | 'newcomer';
export type SourceType = 'OFFICIAL_REGULATION' | 'CUSTOMARY_RULE' | 'COMMUNITY_VERIFIED' | 'GENERAL_ADVISORY';
export type ValidationStatus = 'VERIFIED' | 'UNVERIFIED' | 'EXPIRED' | 'UNDER_REVIEW';
export type RetrievalStatus = 'MATCHED' | 'WEAK_MATCH' | 'NO_MATCH' | 'OUT_OF_SCOPE' | 'OFF_TOPIC';

export interface Settings {
  language: Language;
  userType: UserType;
  location: 'canggu';
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
  location: string;
  applies_to: string[];
  articles: string[];
  page_number: number | null;
  page_ref_type: string | null;
  language: Language;
  flags: string[];
  is_demo_data: boolean;
  relevance: number;
}

export interface Quote {
  text: string;
  language: Language;
  source_id: string;
}

export interface ChatResponse {
  conversation_id: string;
  answer: string;
  why_it_matters: string | null;
  category: string | null;
  recommended_actions: string[];
  quote: Quote | null;
  sources: SourceRef[];
  source_classification: SourceType[];
  caveats: string[];
  retrieval_status: RetrievalStatus;
  confidence: 'high' | 'medium' | 'low' | 'none';
  fallback_used: boolean;
  generation_mode: 'llm' | 'extractive' | 'fallback';
  language: Language;
  search_translation: string | null;
}

export interface Category {
  id: string;
  label: { en: string; id: string };
  documents: number;
}

export type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; response: ChatResponse }
  | { id: string; role: 'error'; text: string; retry: string };
