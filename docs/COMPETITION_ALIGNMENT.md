# Competition Alignment — Bali DigiFest 2026 AI Web Innovation Challenge

Theme: *BUILD WITH AI, SOLVE FOR BALI* · Category: *Bali Smart Society*. Status legend: ✅ evidence exists · ◐ partial · ❌ missing.

## Stage 1 rubric

### Problem Relevance & Impact (20%) — ◐
- **Judges expect:** a real Bali problem, clear users, plausible impact.
- **Demonstrated by:** tourist/newcomer etiquette in Canggu; content drawn from the Bali government's own tourist circular (SE 7/2025), provincial waste regulations and national traffic law; PRD personas and journey.
- **Evidence:** [PRD.md](PRD.md) §3–6; knowledge base sources in [DATA_MODEL.md](DATA_MODEL.md).
- **Incomplete:** no user research or community interviews; impact is a hypothesis (PRD §4); no measured outcome.

### Innovation & Differentiation (15%) — ◐
- **Expect:** something beyond a generic chatbot.
- **Demonstrated by:** every answer carries source classification (official / community-verified / general advice), verification status, applicability to foreign tourists vs everyone, and location scope; refuses to invent customary rules; works with zero paid APIs.
- **Evidence:** API response fields ([API_DOCUMENTATION.md](API_DOCUMENTATION.md)); answer card ([UX_SPECIFICATION.md](UX_SPECIFICATION.md)).
- **Incomplete:** no community-verification workflow with real reviewers yet; no competitor comparison study.

### AI Relevance & Implementation (25%) — ◐
- **Expect:** AI is essential and well implemented.
- **Demonstrated by:** RAG with real multilingual semantic embeddings (e5-small, EN/ID cross-lingual), filtered vector search, relevance gating, Gemini structured generation with citation and language validation, hallucination guards.
- **Evidence:** [AI_IMPLEMENTATION.md](AI_IMPLEMENTATION.md); `server/src/rag/`; eval report `docs/eval/EVAL_REPORT.md`.
- **Incomplete:** LLM generation not live-tested (invalid key) — measured answers are extractive; held-out retrieval 3/7.

### MVP Functionality (20%) — ✅ locally
- **Expect:** a working product, not a mock.
- **Demonstrated by:** all P0 features + P1 feedback/suggestions/in-session history work end-to-end locally (browser + API).
- **Evidence:** [TESTING.md](TESTING.md) §1, §3; 53 automated tests passing.
- **Incomplete:** no public deployment URL.

### Technical Feasibility & Repository Quality (15%) — ✅/◐
- **Expect:** clean, runnable, documented code.
- **Demonstrated by:** TypeScript monorepo, typed interfaces, dependency injection, zod validation, migrations, idempotent ingest, Dockerfile, compose, `.env.example`, tests, eval harness.
- **Evidence:** README, [ARCHITECTURE.md](ARCHITECTURE.md).
- **Incomplete:** pgvector path and Docker build not executed; no CI pipeline.

### Compliance & Documentation (5%) — ✅
- **Expect:** required docs, honest disclosure.
- **Evidence:** the full `docs/` set, [PRODUCT_LIMITATIONS.md](PRODUCT_LIMITATIONS.md), source provenance notes.
- **Incomplete:** organiser-specific submission requirements were not provided to us and are not checked here.

## Final rubric

| Criterion | Weight | Evidence | Gaps |
|---|---|---|---|
| AI Implementation & Technical Depth | 25% | RAG pipeline, guardrails, eval harness with tuning/holdout split | Live LLM untested; retrieval generalisation weak |
| Product Functionality & Reliability | 25% | 53 tests; fail-safe fallbacks (100% grounded, 7/7 fallbacks correct); LLM errors degrade to extractive | Not deployed; no load test |
| Problem-Solution Fit & Impact | 15% | Source-labelled guidance for real situations | No user validation; nothing community-verified |
| Innovation & Differentiation | 15% | Classification + verification + applicability on every answer; anti-fabrication | — |
| UX/UI & Accessibility | 10% | Mobile-first, bilingual, accessible markup, clear states | No user testing, no screen-reader test |
| Scalability & Development Potential | 5% | pgvector schema, provider interfaces, location scope model, reviewer workflow | Multi-location not built (out of scope) |
| Demo & Communication | 5% | Suggested questions make a 2-minute demo easy; docs | Demo video/pitch not produced |

## Highest-value next steps for judging

1. Get a valid Gemini key, run `npm run eval`, and report LLM-mode numbers.
2. Run the pgvector path (`docker compose up -d db`, migrate, ingest, eval with `VECTOR_STORE=pgvector`).
3. Deploy (Vercel + container host) for a public URL.
4. Have a qualified reviewer verify the official summaries against primary texts and mark them `VERIFIED`.
5. Approach Desa Adat Canggu / banjar representatives about community-verified content.
