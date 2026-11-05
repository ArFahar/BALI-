-- LocalNorm AI — knowledge base v2 (Database/ sources processed by knowledge/pipeline, stages 1-5)
-- One document has many chunks. {{EMBEDDING_DIM}} is substituted by src/scripts/migrate.ts (384 = multilingual-e5-small).

-- The v1 table held the 13 hand-written scenarios (one row per scenario per language). Keep it under a new name
-- so nothing is lost; the v2 tables below take over the names used in the knowledge-base design.
ALTER TABLE IF EXISTS knowledge_documents RENAME TO legacy_scenario_chunks;
ALTER INDEX IF EXISTS knowledge_documents_pkey RENAME TO legacy_scenario_chunks_pkey;
ALTER INDEX IF EXISTS knowledge_documents_filter_idx RENAME TO legacy_scenario_chunks_filter_idx;
ALTER INDEX IF EXISTS knowledge_documents_category_idx RENAME TO legacy_scenario_chunks_category_idx;
ALTER INDEX IF EXISTS knowledge_documents_embedding_idx RENAME TO legacy_scenario_chunks_embedding_idx;

CREATE TABLE knowledge_documents (
  id                  UUID PRIMARY KEY,                 -- deterministic UUIDv5 of document_key
  document_key        TEXT NOT NULL UNIQUE,             -- e.g. CANGGU-PARAREM-03-2025
  title               TEXT NOT NULL,
  publisher           TEXT,
  source_type         TEXT NOT NULL CHECK (source_type IN ('OFFICIAL', 'COMMUNITY_VERIFIED', 'GENERAL_ADVISORY')),
  source_subtype      TEXT,                             -- government_regulation | customary_law | research_summary
  source_url          TEXT,
  all_source_urls     JSONB,
  location_scope      TEXT NOT NULL CHECK (location_scope IN ('canggu', 'badung', 'bali', 'indonesia')),
  validation_status   TEXT NOT NULL CHECK (validation_status IN ('VERIFIED', 'UNVERIFIED', 'EXPIRED', 'UNDER_REVIEW')),
  validated_by        TEXT,
  last_verified_at    TIMESTAMPTZ,
  effective_date      DATE,
  effective_date_note TEXT,
  language            TEXT NOT NULL CHECK (language IN ('en', 'id')),
  sha256              TEXT,                             -- hash of the source file
  flags               TEXT[] NOT NULL DEFAULT '{}',     -- e.g. UNOFFICIAL_TRANSLATION, OCR_TEXT, LOCAL_REVIEW_REQUIRED
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kd_verified_needs_validator
    CHECK (validation_status <> 'VERIFIED' OR (validated_by IS NOT NULL AND last_verified_at IS NOT NULL)),
  CONSTRAINT kd_community_needs_validator
    CHECK (source_type <> 'COMMUNITY_VERIFIED' OR validated_by IS NOT NULL)
);

CREATE TABLE knowledge_chunks (
  id              UUID PRIMARY KEY,                     -- deterministic UUIDv5 of chunk_key
  document_id     UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_key       TEXT NOT NULL UNIQUE,                 -- e.g. CANGGU-AWIG-2012-ID::Pasal-4#1
  unit_ids        TEXT[] NOT NULL,
  context_header  TEXT NOT NULL,
  articles        TEXT[] NOT NULL DEFAULT '{}',
  chapter         TEXT,
  part            TEXT NOT NULL,                        -- "1/2"
  content         TEXT NOT NULL,                        -- header + body, exactly what was embedded (after "passage: ")
  content_sha256  TEXT NOT NULL,
  token_count     INTEGER NOT NULL CHECK (token_count <= 512),
  category        TEXT NOT NULL CHECK (category IN ('religious_etiquette', 'sacred_places', 'public_behavior',
                    'neighborhood_etiquette', 'environmental_etiquette', 'traffic_etiquette', 'social_interaction',
                    'customary_context')),
  location_scope  TEXT NOT NULL CHECK (location_scope IN ('canggu', 'badung', 'bali', 'indonesia')),
  applicable_to   TEXT[] NOT NULL,
  page_number     INTEGER,
  page_numbers    INTEGER[] NOT NULL DEFAULT '{}',
  page_ref_type   TEXT,                                 -- pdf_page | original_scan_page
  language        TEXT NOT NULL CHECK (language IN ('en', 'id')),
  flags           TEXT[] NOT NULL DEFAULT '{}',
  embedding_model TEXT NOT NULL,
  embedding       vector({{EMBEDDING_DIM}}) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_chunks_document_idx ON knowledge_chunks (document_id);
CREATE INDEX knowledge_chunks_filter_idx ON knowledge_chunks (location_scope, category, language);
CREATE INDEX knowledge_chunks_applicable_idx ON knowledge_chunks USING gin (applicable_to);
CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- One row per load, so every index can be traced back to the exact model and chunk file that produced it.
CREATE TABLE knowledge_ingest_runs (
  id              BIGSERIAL PRIMARY KEY,
  embedding_model TEXT NOT NULL,
  onnx_sha256     TEXT,
  chunks_sha256   TEXT NOT NULL,
  documents       INTEGER NOT NULL,
  chunks          INTEGER NOT NULL,
  manifest        JSONB NOT NULL,
  loaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
