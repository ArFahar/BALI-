# LocalNorm AI

**A location-aware cultural & social etiquette assistant for Canggu, Bali.**
Bali DigiFest 2026 — AI Web Innovation Challenge · *Bali Smart Society*.

> Help people understand local norms before their actions become social misunderstandings.

## Problem and solution

Tourists and newcomers in Canggu live alongside a residential Balinese community whose expectations around temples, ceremonies, dress, traffic, waste and neighbourhood life may be unfamiliar. Guidance exists — governor circulars, provincial regulations, national law, hotel-association advice — but it is scattered and hard to apply to a specific moment. *(This is a working hypothesis; see [docs/PRD.md](docs/PRD.md) §4.)*

LocalNorm AI answers everyday etiquette questions in **English or Indonesian** using retrieval-augmented generation over a documented knowledge base built from **Bali provincial regulations (JIDHAT), Desa Adat Canggu's own pararem and awig-awig, and two research packs** (see [docs/KNOWLEDGE_BASE_V2.md](docs/KNOWLEDGE_BASE_V2.md)). Every answer shows **which source it comes from**, whether that source is an **official regulation, a community-verified guideline or general advice**, whether it has been **verified**, whether it applies **to everyone, to foreign tourists, to non-members (tamiu) or only to registered customary members (krama adat)**, and which article and page it comes from. Rule text is quoted verbatim in its original language — never machine-translated. When the knowledge base has no reliable answer, it says so and suggests who to ask — it does not invent rules.

## Main features

- Landing page, Tourist/Newcomer context, Canggu location, EN/ID language
- Chat with suggested questions, loading / error-with-retry / empty states
- Knowledge pipeline in six gated stages: extract/OCR → structure + metadata → chunk → embed → PostgreSQL + pgvector → RAG
- RAG: question translated EN↔ID (local OPUS-MT) for cross-lingual search → pgvector search → relevance gate → applicability-aware ranking → LLM (Gemini) or extractive answer with verbatim quote → citation & language validation
- Answer card: guidance · verbatim source text · why it matters · recommended actions · notes/caveats · sources with classification, verification status, article, page, warning flags, link
- Fallbacks: not in knowledge base, outside pilot area, off-topic, customary-rule requests, fabrication attempts
- Feedback (helpful / not helpful)
- Evaluation harness with tuning and held-out splits

## Technology stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite 6, TypeScript, Tailwind CSS 4, lucide-react |
| Backend | Node.js, Express 4, TypeScript, zod, express-rate-limit |
| Database | PostgreSQL 16 + pgvector (Docker); file-based fallback reading the same vectors |
| AI | `Xenova/multilingual-e5-small` embeddings · `Xenova/opus-mt-en-id` / `opus-mt-id-en` query translation (all local via transformers.js, no key) · Gemini `gemini-2.5-flash` (optional) |
| Knowledge pipeline | Python 3 (pypdf, poppler `pdftotext`), Windows OCR, Node scripts (`knowledge/pipeline/`) |
| Tests | Vitest, Supertest, Testing Library |
| Infra | Vercel (web), Docker (API), docker-compose (pgvector) |

## Architecture overview

```
web (React SPA) ──/api──▶ Express API ──▶ RAG pipeline
                                         ├─ classifier (EN/ID, scope, safety flags)
                                         ├─ query translator (local OPUS-MT EN↔ID)
                                         ├─ embedder (local e5-small)
                                         ├─ knowledge base (pgvector | files)
                                         └─ generator (Gemini | extractive + quote) + validator
Database/ ──knowledge/pipeline (stages 1-4)──▶ knowledge/processing/ ──stage 5──▶ pgvector
```

Details and Mermaid diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ARSITEKTUR_DAN_WORKFLOW.md](docs/ARSITEKTUR_DAN_WORKFLOW.md), [docs/KNOWLEDGE_BASE_V2.md](docs/KNOWLEDGE_BASE_V2.md).

## Prerequisites

- Node.js ≥ 20 (developed on 23.9) and npm
- ~500 MB free disk for dependencies and the local models (embedding ~120 MB, translation ~2×100 MB); internet on first run
- Docker (for pgvector) — optional, the API can read the knowledge base from files
- To rebuild the knowledge base: Python 3 with `pypdf`, poppler `pdftotext`, Windows 10/11 for OCR
- Optional: a Gemini API key

## Installation

```bash
git clone <repo-url> localnorm-ai && cd localnorm-ai
npm install
```

## Environment configuration

```bash
cp .env.example server/.env      # all values optional for local use
```

With no variables set the API reads the prebuilt knowledge base from `knowledge/processing/`, uses local embeddings and translation, and answers in **extractive mode** (framing sentence + verbatim quote). Set `DATABASE_URL` to use pgvector and `GEMINI_API_KEY` to enable LLM answers. See [.env.example](.env.example).

## Database setup (optional — pgvector)

```bash
docker compose up -d db
export DATABASE_URL=postgresql://localnorm:localnorm@localhost:5433/localnorm
npm run migrate
npm run kb:load       # loads the prebuilt chunks + vectors and verifies pgvector search
```

To rebuild the knowledge base from `Database/` (stages 1-4): `npm run kb:build`. See [knowledge/pipeline/README.md](knowledge/pipeline/README.md).

## Running locally

```bash
npm run dev:server    # API  → http://localhost:8787 (first run downloads the local models)
npm run dev:web       # Web  → http://localhost:5173 (proxies /api)
```

## Running tests

```bash
npm test              # server (57) + web (8) unit/API/UI/knowledge-base tests
DATABASE_URL=... npm run eval   # 37 evaluation scenarios → docs/eval/EVAL_REPORT.md
npm run typecheck
```

Latest measured results are in [docs/TESTING.md](docs/TESTING.md).

## Deployment

Frontend on Vercel (root `web/`, `VITE_API_BASE_URL`), backend via `server/Dockerfile` on any container host, optional managed Postgres with pgvector. **Not deployed yet.** See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

| Doc | |
|---|---|
| [PROJECT_AUDIT](docs/PROJECT_AUDIT.md) | Phase 0 inspection, risks, strategy |
| [PRD](docs/PRD.md) | Requirements, personas, acceptance criteria |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | System, RAG, ingestion, user-flow diagrams |
| [KNOWLEDGE_BASE_V2](docs/KNOWLEDGE_BASE_V2.md) | **Current knowledge base: 6-stage pipeline, gate decisions, schema, retrieval, evaluation** |
| [DATA_MODEL](docs/DATA_MODEL.md) | Data model (v1 sections superseded by KNOWLEDGE_BASE_V2) |
| [AI_IMPLEMENTATION](docs/AI_IMPLEMENTATION.md) | Pipeline, thresholds, safety behaviour |
| [API_DOCUMENTATION](docs/API_DOCUMENTATION.md) | Endpoints, schemas, errors, examples |
| [UX_SPECIFICATION](docs/UX_SPECIFICATION.md) | Design tokens, views, accessibility |
| [TESTING](docs/TESTING.md) | Tests, eval scenarios, measured results |
| [DEPLOYMENT](docs/DEPLOYMENT.md) · [SECURITY](docs/SECURITY.md) | Ops and security |
| [PRODUCT_LIMITATIONS](docs/PRODUCT_LIMITATIONS.md) | Everything that is not done or not verified |
| [COMPETITION_ALIGNMENT](docs/COMPETITION_ALIGNMENT.md) | Rubric mapping with evidence and gaps |
| [FINAL_EXECUTION_REPORT](docs/FINAL_EXECUTION_REPORT.md) | What was built and verified |

## Known limitations

- **Nothing is verified by a human reviewer.** The Desa Adat Canggu awig-awig is an **unofficial translation of the 2012 edition** whose current validity is unconfirmed; it has not been reviewed by Desa Adat Canggu.
- **No LLM** (no valid key): English users get an English framing sentence plus the **Indonesian** rule text, because machine translation was shown to change rule meaning.
- Category/applicability metadata were assigned by keyword rules and need human review; untagged awig-awig articles default to *krama adat*.
- Evaluation: 25/26 (round 1) and 10/11 (round 2) on scenarios written before running the system; exploratory probes still show wrong-but-labelled answers (e.g. rent prices, registering with the banjar).
- Docker image not built; not deployed.
- Not legal advice. Full list: [docs/PRODUCT_LIMITATIONS.md](docs/PRODUCT_LIMITATIONS.md).
