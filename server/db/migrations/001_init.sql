-- LocalNorm AI — initial schema
-- {{EMBEDDING_DIM}} is substituted by src/scripts/migrate.ts (default 384 for multilingual-e5-small).

CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN
  CREATE TYPE source_type AS ENUM ('OFFICIAL_REGULATION', 'COMMUNITY_VERIFIED', 'GENERAL_ADVISORY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE validation_status AS ENUM ('VERIFIED', 'UNVERIFIED', 'EXPIRED', 'UNDER_REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id                TEXT PRIMARY KEY,               -- e.g. ln-001-en
  doc_id            TEXT NOT NULL,                  -- scenario id shared across languages
  language          TEXT NOT NULL CHECK (language IN ('en', 'id')),
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  why               TEXT NOT NULL,
  actions           JSONB NOT NULL DEFAULT '[]'::jsonb,
  category          TEXT NOT NULL,
  location          TEXT NOT NULL CHECK (location IN ('canggu', 'badung', 'bali', 'indonesia')),
  applies_to        TEXT[] NOT NULL DEFAULT ARRAY['everyone'],
  source_name       TEXT NOT NULL,
  source_url        TEXT,
  source_type       source_type NOT NULL,
  validation_status validation_status NOT NULL DEFAULT 'UNVERIFIED',
  validated_by      TEXT,
  effective_date    DATE,
  last_verified_at  TIMESTAMPTZ,
  is_demo_data      BOOLEAN NOT NULL DEFAULT FALSE,
  notes             TEXT,
  content_hash      TEXT NOT NULL,
  embedding_model   TEXT NOT NULL,
  embedding         vector({{EMBEDDING_DIM}}) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verified_needs_validator
    CHECK (validation_status <> 'VERIFIED' OR (validated_by IS NOT NULL AND last_verified_at IS NOT NULL)),
  CONSTRAINT demo_never_verified
    CHECK (NOT (is_demo_data AND validation_status = 'VERIFIED'))
);

CREATE INDEX IF NOT EXISTS knowledge_documents_filter_idx
  ON knowledge_documents (language, location, validation_status);
CREATE INDEX IF NOT EXISTS knowledge_documents_category_idx
  ON knowledge_documents (category);
-- HNSW cosine index. With only tens of rows Postgres will usually seq-scan; the index matters as the corpus grows.
CREATE INDEX IF NOT EXISTS knowledge_documents_embedding_idx
  ON knowledge_documents USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS feedback (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id      TEXT,
  rating          TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful')),
  comment         TEXT,
  source_ids      TEXT[] NOT NULL DEFAULT '{}',
  language        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
