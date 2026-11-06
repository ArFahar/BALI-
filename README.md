# Mawacara AI

**A location-aware cultural & social etiquette assistant for Canggu, Bali.**
Bali DigiFest 2026 — AI Web Innovation Challenge · *Bali Smart Society*.

> Help people understand local norms before their actions become social misunderstandings.

## Problem and solution

Tourists and newcomers in Canggu live alongside a residential Balinese community whose expectations around temples, ceremonies, dress, traffic, waste and neighbourhood life may be unfamiliar. Guidance exists — governor circulars, provincial regulations, national law, hotel-association advice — but it is scattered and hard to apply to a specific moment. *(This is a working hypothesis; see [docs/PRD.md](docs/PRD.md) §4.)*

Mawacara AI answers etiquette questions in **English or Indonesian** using retrieval-augmented generation over **Bali provincial regulations (JIDHAT), Canggu pararem and awig-awig, and two research packs**. Sourced answers show the documents used, their classification, verification status, applicability, and article/page references where available. Legal passages remain in their original language. The backend distinguishes sourced, hybrid, general-knowledge, and abstaining answers. General knowledge is labelled and cannot answer high-risk questions on its own. See [AI implementation](docs/AI_IMPLEMENTATION.md) and [knowledge-base processing](docs/KNOWLEDGE_BASE_V2.md).

## Main features

- Landing page, Tourist/Newcomer context, Canggu location, EN/ID language
- Chat with suggested questions, loading / error-with-retry / empty states
- Knowledge pipeline in six gated stages: extract/OCR → structure + metadata → chunk → embed → PostgreSQL + pgvector → RAG
- RAG: question translated EN↔ID (local OPUS-MT, or the LLM on Vercel) for cross-lingual search → vector search → relevance gate → applicability-aware ranking → LLM (SumoPod/DeepSeek or Gemini) or extractive answer → citation & language validation
- Answer card: guidance · verbatim source text (also shown next to LLM summaries) · why it matters · recommended actions · notes/caveats · sources with classification, verification status, article, page, warning flags, link
- Fallbacks: not in knowledge base, outside pilot area, off-topic, customary-rule requests, fabrication attempts
- Feedback (helpful / not helpful)
- Evaluation harness with tuning and held-out splits

## Technology stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite 6, TypeScript, Tailwind CSS 4, lucide-react |
| Backend | Node.js, Express 4, TypeScript, zod, express-rate-limit |
| Database | PostgreSQL 16 + pgvector (Docker); file-based fallback reading the same vectors (used on Vercel) |
| AI | `Xenova/multilingual-e5-small` embeddings · `Xenova/opus-mt-en-id` / `opus-mt-id-en` query translation (local via transformers.js, no key) · SumoPod `deepseek-v4-flash` (answers; query translation on Vercel) · optional Gemini |
| Knowledge pipeline | Python 3 (pypdf, poppler `pdftotext`), Windows OCR, Node scripts (`knowledge/pipeline/`) |
| Tests | Vitest, Supertest, Testing Library |
| Infra | Vercel (frontend and API); Docker/docker-compose for optional local API and pgvector |

## Architecture overview

```
web (React SPA) ──/api──▶ Express API ──▶ RAG pipeline
                                         ├─ classifier (EN/ID, scope, safety flags)
                                         ├─ query translator (local OPUS-MT | LLM | glossary)
                                         ├─ embedder (local e5-small)
                                         ├─ knowledge base (pgvector | files)
                                         └─ generator (SumoPod | Gemini | extractive + quote) + validator
Database/ ──knowledge/pipeline (stages 1-4)──▶ knowledge/processing/ ──stage 5──▶ pgvector
```

Details and Mermaid diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ARSITEKTUR_DAN_WORKFLOW.md](docs/ARSITEKTUR_DAN_WORKFLOW.md), [docs/KNOWLEDGE_BASE_V2.md](docs/KNOWLEDGE_BASE_V2.md).

## Prerequisites

- Node.js 22.x and npm (matches the package engine and Vercel runtime)
- ~500 MB free disk for dependencies and the local models (embedding ~120 MB, translation ~2×100 MB); internet on first run
- Docker (for pgvector) — optional, the API can read the knowledge base from files
- To rebuild the knowledge base: Python 3 with `pypdf`, poppler `pdftotext`, Windows 10/11 for OCR
- Optional: a SumoPod or Gemini API key

## Installation

```bash
git clone https://github.com/PlaneFly545/Mawacara-AI.git
cd Mawacara-AI
npm install
```

## Environment configuration

```bash
cp .env.example server/.env      # all values optional for local use
```

With no variables set the API reads the prebuilt knowledge base from `knowledge/processing/`, uses local embeddings and translation, and answers in **extractive mode** (framing sentence + verbatim quote). Set `DATABASE_URL` to use pgvector.

For LLM answers with SumoPod, set `LLM_PROVIDER=sumopod`, `SUMOPOD_API_KEY`, `SUMOPOD_BASE_URL=https://ai.sumopod.com/v1` and `SUMOPOD_MODEL=deepseek-v4-flash` in `server/.env`, then restart the API. The backend validates response shape, detected language, citation identifiers, and reasoning mode. Sourced answers include the first cited legal passage when available. Low/medium-risk questions may receive labelled general knowledge; high-risk questions require retrieved evidence. Invalid drafts use extractive fallback when relevant sources exist, otherwise the system reports its limits. Keep `LLM_TIMEOUT_MS` + `TRANSLATE_TIMEOUT_MS` below the web client's 45-second timeout (e.g. 35000 + 5000). The key stays on the server; never use a `VITE_` variable for it. Gemini remains available with `LLM_PROVIDER=gemini` and `GEMINI_API_KEY`. See [.env.example](.env.example).

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
npm test              # server and web unit/API/UI/knowledge-base tests
npm run eval          # uses the configured knowledge store and LLM; may incur API costs
npm run typecheck
```

Latest measured results are in [docs/TESTING.md](docs/TESTING.md).

## Deployment

Production: **https://mawacara.vercel.app**. The repository root deploys the Vite frontend and Express API together on Vercel. `npm run build:vercel` builds the app and bundles the local embedding model plus 120 precomputed knowledge chunks and their vectors. SumoPod credentials are configured as server-only production environment variables. Production uses `KB_SOURCE=files` to load the precomputed vectors into memory for search. PostgreSQL/pgvector is optional. Conversation history and feedback are temporary. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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
- **Reasoning modes (grounded / hybrid / general / abstain):** low- and medium-risk questions outside the knowledge base may be answered from the LLM's general knowledge, clearly labelled and unverified; high-risk questions (rituals, customary or legal rules, fines, visas) need a source or the assistant abstains. See [docs/KNOWLEDGE_BASE_V2.md](docs/KNOWLEDGE_BASE_V2.md#reasoning-modes-hybrid-reasoning-rag-5-november-2026).
- **LLM mode (SumoPod) with knowledge base v2:** 41/42 on the evaluation set after updating it for the reasoning modes (holdout 27/28; safety checks 42/42; [report](docs/eval/llm/EVAL_REPORT.md)); extractive mode without an LLM also 41/42. Paraphrase faithfulness is not scored automatically; the verbatim source text stays available under each answer.
- **Without an LLM**, English users get an English framing sentence plus the **Indonesian** rule text, because machine translation was shown to change rule meaning.
- Category/applicability metadata were assigned by keyword rules and need human review; untagged awig-awig articles default to *krama adat*.
- Evaluation: 25/26 (round 1) and 10/11 (round 2) on scenarios written before running the system; exploratory probes still show wrong-but-labelled answers (e.g. rent prices, registering with the banjar).
- On Vercel, query translation uses the LLM (or glossary terms without a key) instead of the local OPUS-MT models, which exceed the function size limit; this variant has not been evaluated. Feedback in `/tmp` is temporary. Docker image not built.
- Not legal advice. Full list: [docs/PRODUCT_LIMITATIONS.md](docs/PRODUCT_LIMITATIONS.md).
