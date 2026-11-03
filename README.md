# LocalNorm AI

**A location-aware cultural & social etiquette assistant for Canggu, Bali.**
Bali DigiFest 2026 — AI Web Innovation Challenge · *Bali Smart Society*.

> Help people understand local norms before their actions become social misunderstandings.

## Problem and solution

Tourists and newcomers in Canggu live alongside a residential Balinese community whose expectations around temples, ceremonies, dress, traffic, waste and neighbourhood life may be unfamiliar. Guidance exists — governor circulars, provincial regulations, national law, hotel-association advice — but it is scattered and hard to apply to a specific moment. *(This is a working hypothesis; see [docs/PRD.md](docs/PRD.md) §4.)*

LocalNorm AI answers everyday etiquette questions in **English or Indonesian** using retrieval-augmented generation over a small, documented knowledge base. Every answer shows **which source it comes from**, whether that source is an **official regulation, a community-verified guideline or general advice**, whether it has been **verified**, and whether it applies **to everyone or only to foreign tourists**. When the knowledge base has no reliable answer, it says so and suggests who to ask — it does not invent rules.

## Main features

- Landing page, Tourist/Newcomer context, Canggu location, EN/ID language
- Chat with suggested questions, loading / error-with-retry / empty states
- RAG: multilingual semantic embeddings → filtered vector search → relevance gate → LLM (Gemini) or extractive generation → citation & language validation
- Answer card: guidance · why it matters · recommended actions · notes/caveats · sources with classification, verification status, link
- Fallbacks: not in knowledge base, outside pilot area, off-topic, customary-rule requests, fabrication attempts
- Feedback (helpful / not helpful)
- Evaluation harness with tuning and held-out splits

## Technology stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite 6, TypeScript, Tailwind CSS 4, lucide-react |
| Backend | Node.js, Express 4, TypeScript, zod, express-rate-limit |
| Database | PostgreSQL + pgvector (optional; in-memory store without it) |
| AI | `Xenova/multilingual-e5-small` via transformers.js (local, no key) · Gemini `gemini-2.5-flash` (optional) · optional Gemini embeddings |
| Tests | Vitest, Supertest, Testing Library |
| Infra | Vercel (web), Docker (API), docker-compose (pgvector) |

## Architecture overview

```
web (React SPA) ──/api──▶ Express API ──▶ RAG pipeline
                                         ├─ classifier (EN/ID, scope, safety flags)
                                         ├─ embedder (local e5-small | Gemini)
                                         ├─ vector store (pgvector | memory)
                                         └─ generator (Gemini | extractive) + validator
knowledge/scenarios.json ──npm run ingest──▶ vector store
```

Details and Mermaid diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Prerequisites

- Node.js ≥ 20 (developed on 23.9) and npm
- ~300 MB free disk for dependencies and the embedding model; internet on first run
- Optional: Docker (for pgvector), a Gemini API key

## Installation

```bash
git clone <repo-url> localnorm-ai && cd localnorm-ai
npm install
```

## Environment configuration

```bash
cp .env.example server/.env      # all values optional for local use
```

With no variables set the API uses local embeddings, the in-memory vector store and **extractive mode** (answers quoted from the knowledge base). Set `GEMINI_API_KEY` to enable LLM answers. See [.env.example](.env.example).

## Database setup (optional — pgvector)

```bash
docker compose up -d db
export DATABASE_URL=postgresql://localnorm:localnorm@localhost:5433/localnorm
npm run migrate
npm run ingest
```

Without `DATABASE_URL`, `npm run ingest` just validates the knowledge base and warms the local embedding cache. *(The pgvector path is implemented but was not executed in development — see Known limitations.)*

## Running locally

```bash
npm run ingest        # first time: validates KB, downloads model (~120 MB), embeds 26 chunks
npm run dev:server    # API  → http://localhost:8787
npm run dev:web       # Web  → http://localhost:5173 (proxies /api)
```

## Running tests

```bash
npm test              # server (46) + web (8) unit/API/UI tests
npm run eval          # real-embedding evaluation → docs/eval/EVAL_REPORT.md
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
| [DATA_MODEL](docs/DATA_MODEL.md) | Schema, knowledge base inventory, provenance |
| [AI_IMPLEMENTATION](docs/AI_IMPLEMENTATION.md) | Pipeline, thresholds, safety behaviour |
| [API_DOCUMENTATION](docs/API_DOCUMENTATION.md) | Endpoints, schemas, errors, examples |
| [UX_SPECIFICATION](docs/UX_SPECIFICATION.md) | Design tokens, views, accessibility |
| [TESTING](docs/TESTING.md) | Tests, eval scenarios, measured results |
| [DEPLOYMENT](docs/DEPLOYMENT.md) · [SECURITY](docs/SECURITY.md) | Ops and security |
| [PRODUCT_LIMITATIONS](docs/PRODUCT_LIMITATIONS.md) | Everything that is not done or not verified |
| [COMPETITION_ALIGNMENT](docs/COMPETITION_ALIGNMENT.md) | Rubric mapping with evidence and gaps |
| [FINAL_EXECUTION_REPORT](docs/FINAL_EXECUTION_REPORT.md) | What was built and verified |

## Known limitations

- **No knowledge entry is verified yet**, and nothing has been reviewed by Desa Adat Canggu or any community body. No Canggu customary rules are included.
- **LLM mode not live-tested** (no valid key); all measured answers are extractive.
- **Retrieval generalises poorly:** 3/7 correct on held-out questions (fails safe, but falls back too often).
- **pgvector path and Docker image not executed; not deployed.**
- Not legal advice. Full list: [docs/PRODUCT_LIMITATIONS.md](docs/PRODUCT_LIMITATIONS.md).
