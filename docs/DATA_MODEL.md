# Data Model & Knowledge Base

> **Update 2026-11-05 — knowledge base v2.** The 13 hand-written scenarios described below were retired. The system now uses the knowledge base built from `Database/` (Bali regulations, Desa Adat Canggu pararem and awig-awig, research packs) through a six-stage pipeline, stored in PostgreSQL + pgvector, with EN↔ID query translation and verbatim quotes. Where this document disagrees with [KNOWLEDGE_BASE_V2.md](KNOWLEDGE_BASE_V2.md), **KNOWLEDGE_BASE_V2.md is current**.

## 1. Source of truth

`knowledge/scenarios.json` — reviewed in git, validated by `server/src/rag/knowledge.ts` on every load and ingest. Each **scenario** is written in English and Indonesian and becomes two retrievable **chunks** (`ln-001-en`, `ln-001-id`).

### Scenario fields

| Field | Type | Notes |
|---|---|---|
| `id` | `ln-NNN` | Stable id, shown to users as the citation id |
| `category` | enum | `neighborhood`, `waste_management`, `public_behavior`, `religious_cultural`, `sacred_place`, `traffic`, `social_interaction`, `accommodation` |
| `location` | enum | Geographic scope the source applies to: `canggu`, `badung`, `bali`, `indonesia` |
| `applies_to` | `everyone` \| `foreign_tourist` | Drives the applicability caveat for newcomers |
| `source_name` | text | Full name of the regulation / publication, and the secondary channel if the primary was not reachable |
| `source_url` | URL \| null | Required for `OFFICIAL_REGULATION`; null only for editorial demo content |
| `source_type` | enum | `OFFICIAL_REGULATION`, `COMMUNITY_VERIFIED`, `GENERAL_ADVISORY` |
| `validation_status` | enum | `VERIFIED`, `UNVERIFIED`, `EXPIRED`, `UNDER_REVIEW` |
| `validated_by` | text \| null | Named human reviewer. Required for `VERIFIED` |
| `effective_date` | date \| null | Left null when not confirmed from the primary text |
| `last_verified_at` | timestamp \| null | Required for `VERIFIED` |
| `is_demo_data` | bool | `true` = DEMO_DATA (editorial, synthetic) |
| `notes` | text | Provenance and caveats for reviewers |
| `translations.{en,id}` | object | `title`, `content`, `why`, `actions[]` |

### Integrity rules (enforced in code and in SQL)

1. `VERIFIED` ⇒ `validated_by` and `last_verified_at` present.
2. `is_demo_data` ⇒ never `VERIFIED`.
3. `OFFICIAL_REGULATION` ⇒ `source_url` present.
4. Unique ids; both languages required.

### Status semantics in retrieval

| Status | Retrieved? | Presented as |
|---|---|---|
| `VERIFIED` | yes | authoritative (confidence can be `high`) |
| `UNDER_REVIEW` | yes | guidance + caveat "not yet verified" (confidence at most `medium`) |
| `UNVERIFIED` | yes | guidance + caveat; `DEMO_DATA` caveat if applicable |
| `EXPIRED` | **no** (filtered in the query) | — |

## 2. Current knowledge base (13 scenarios × 2 languages = 26 chunks)

| ID | Category | Scope | Applies to | Source | Type | Status |
|---|---|---|---|---|---|---|
| ln-001 | sacred_place | bali | foreign tourists | SE Gubernur Bali 7/2025 (via CNA Indonesia) | OFFICIAL_REGULATION | UNDER_REVIEW |
| ln-002 | sacred_place | bali | foreign tourists | SE 7/2025 | OFFICIAL_REGULATION | UNDER_REVIEW |
| ln-003 | religious_cultural | bali | foreign tourists | SE 7/2025 | OFFICIAL_REGULATION | UNDER_REVIEW |
| ln-004 | religious_cultural | bali | everyone | ANTARA Bali report quoting PHRI Bali on Nyepi (7 Mar 2024) | GENERAL_ADVISORY | UNDER_REVIEW |
| ln-005 | public_behavior | bali | foreign tourists | SE 7/2025 | OFFICIAL_REGULATION | UNDER_REVIEW |
| ln-006 | social_interaction | bali | foreign tourists | SE 7/2025 | OFFICIAL_REGULATION | UNDER_REVIEW |
| ln-007 | neighborhood | canggu | everyone | LocalNorm editorial | GENERAL_ADVISORY | UNVERIFIED · **DEMO_DATA** |
| ln-008 | waste_management | bali | everyone | Pergub Bali 97/2018 (JDIH Bali) + SE 7/2025 | OFFICIAL_REGULATION | UNDER_REVIEW |
| ln-009 | waste_management | bali | everyone | Pergub Bali 47/2019 (secondary copy, BASAbali Wiki) | OFFICIAL_REGULATION | UNDER_REVIEW |
| ln-010 | traffic | indonesia | everyone | UU 22/2009 Pasal 106(8), 291(1) (BPK JDIH) + SE 7/2025 | OFFICIAL_REGULATION | UNDER_REVIEW |
| ln-011 | traffic | bali | foreign tourists | SE 7/2025 | OFFICIAL_REGULATION | UNDER_REVIEW |
| ln-012 | accommodation | bali | foreign tourists | Perda Bali 6/2023 via Love Bali portal + SE 7/2025 | OFFICIAL_REGULATION | UNDER_REVIEW |
| ln-013 | religious_cultural | bali | everyone | LocalNorm editorial | GENERAL_ADVISORY | UNVERIFIED · **DEMO_DATA** |

**Coverage of the master-prompt categories:** all 8 are covered.

**What is deliberately absent:** any Desa Adat Canggu or banjar rule (awig-awig, pararem, customary fines), local waste-collection schedules, and `COMMUNITY_VERIFIED` content. These require a partnership with local representatives. `ln-007` is the only `canggu`-scoped entry and it is DEMO_DATA, so the app tells users that no Canggu-specific verified rule exists.

### Provenance notes

- SE 7/2025 content was taken from the CNA Indonesia report of 7 Apr 2025 that lists the circular's obligations and prohibitions. The circular's PDF on `disparda.baliprov.go.id` was found in search results but returned HTTP 404 when fetched on 2026-11-03.
- UU 22/2009 article wording (helmet obligation and penalty) was checked against pasal.id on 2026-11-03 (original text; later amendments not checked for these articles).
- Nyepi details (24-hour stay-in, 06:00–06:00 WITA, flight closure) are from the ANTARA article (2024 Nyepi). Dates change yearly.
- Practical tips in `actions` are written as general advice; where the source does not state them, the scenario `notes` say so.

## 3. PostgreSQL schema (`server/db/migrations/001_init.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TYPE source_type AS ENUM ('OFFICIAL_REGULATION','COMMUNITY_VERIFIED','GENERAL_ADVISORY');
CREATE TYPE validation_status AS ENUM ('VERIFIED','UNVERIFIED','EXPIRED','UNDER_REVIEW');

CREATE TABLE knowledge_documents (
  id TEXT PRIMARY KEY, doc_id TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en','id')),
  title TEXT NOT NULL, content TEXT NOT NULL, why TEXT NOT NULL, actions JSONB NOT NULL,
  category TEXT NOT NULL,
  location TEXT NOT NULL CHECK (location IN ('canggu','badung','bali','indonesia')),
  applies_to TEXT[] NOT NULL,
  source_name TEXT NOT NULL, source_url TEXT,
  source_type source_type NOT NULL, validation_status validation_status NOT NULL,
  validated_by TEXT, effective_date DATE, last_verified_at TIMESTAMPTZ,
  is_demo_data BOOLEAN NOT NULL, notes TEXT,
  content_hash TEXT NOT NULL, embedding_model TEXT NOT NULL,
  embedding vector(384) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
  CHECK (validation_status <> 'VERIFIED' OR (validated_by IS NOT NULL AND last_verified_at IS NOT NULL)),
  CHECK (NOT (is_demo_data AND validation_status = 'VERIFIED'))
);
-- indexes: (language, location, validation_status), (category), HNSW (embedding vector_cosine_ops)

CREATE TABLE feedback (id BIGSERIAL PRIMARY KEY, conversation_id TEXT NOT NULL, message_id TEXT,
  rating TEXT CHECK (rating IN ('helpful','not_helpful')), comment TEXT, source_ids TEXT[],
  language TEXT, created_at TIMESTAMPTZ DEFAULT now());
```

The vector dimension is templated (`{{EMBEDDING_DIM}}`) so switching to Gemini embeddings means setting `EMBEDDING_DIM` and re-running migrate on a fresh database + ingest.

**Status: this schema and `PgVectorStore` have been type-checked but not executed against a real Postgres + pgvector instance in this session** (Docker Desktop would not start; local Postgres 18 has no pgvector). See [FINAL_EXECUTION_REPORT.md](FINAL_EXECUTION_REPORT.md).

## 4. Feedback record

`{ conversation_id (uuid), message_id?, rating: helpful|not_helpful, comment? (≤500), source_ids? (ln-NNN[]), language?, created_at }` — written to `server/data/feedback.jsonl` (memory mode) or the `feedback` table (pgvector mode). No chat text is stored.

## 5. How to verify an entry (reviewer workflow)

1. Open the primary text (JDIH / official PDF), compare with `translations.*.content`.
2. Fix any discrepancy; set `effective_date` from the primary text.
3. Set `validation_status: "VERIFIED"`, `validated_by: "<name, role/organisation>"`, `last_verified_at: "<ISO date>"`.
4. `npm run ingest`. Integrity rules reject incomplete verification.
5. For community guidance, use `source_type: "COMMUNITY_VERIFIED"` only with a named representative's consent.
