# Final Execution Report — LocalNorm AI MVP

Date: 2026-11-03

## 1. Executive summary

A working, locally runnable LocalNorm AI MVP was built: a bilingual (EN/ID) React web app and an Express API running a retrieval-augmented pipeline over a 13-scenario knowledge base with real multilingual embeddings. Every answer is cited, classified (official regulation / community-verified / general advice), marked with its verification status and applicability, and the system falls back honestly when it has no reliable source. 53 automated tests pass and a 28-scenario evaluation was measured.

Three things are **not** verified: (1) live LLM generation — the only Gemini key available was invalid, so all measured answers are extractive; (2) the PostgreSQL + pgvector path — implemented but not executed because Docker Desktop failed to start; (3) production deployment — not done. Retrieval generalises poorly to unseen wording (3/7 on the held-out set), failing safely.

## 2. Features implemented

| Feature | Status |
|---|---|
| Landing page | ✅ |
| Tourist/Newcomer context | ✅ |
| Canggu location selection | ✅ (only option, by design) |
| Chat interface | ✅ |
| LLM integration (Gemini) | ✅ implemented, unit-tested with mock · ❌ not live-tested |
| RAG retrieval | ✅ (memory store, real embeddings) |
| Curated knowledge base | ✅ 13 scenarios × EN/ID, 8 categories |
| Source citations | ✅ |
| Source classification + validation status | ✅ |
| Contextual explanations (why + actions) | ✅ |
| Fallback responses | ✅ no-match, out-of-scope, off-topic, customary request, fabrication |
| Loading / error / empty states | ✅ |
| Responsive design | ✅ checked at 375 px |
| README + docs | ✅ |
| P1 feedback | ✅ |
| P1 suggested questions | ✅ |
| P1 chat history | ◐ in-session only (server memory, 6 turns) |

## 3. Architecture delivered

npm-workspace monorepo: `web/` (React/Vite/TS/Tailwind), `server/` (Express/TS) with injectable `Embedder`, `VectorStore` (memory | pgvector), `LlmClient` (Gemini), `FeedbackStore` (file | Postgres); `knowledge/scenarios.json` as reviewed source of truth; SQL migration; ingest, migrate and eval scripts; Dockerfile, docker-compose, Vercel config. See [ARCHITECTURE.md](ARCHITECTURE.md).

## 4. AI and RAG implementation

Classifier (category, language, scope and safety flags) → follow-up-aware query → `multilingual-e5-small` embedding → filtered cosine search (language, location scope, not EXPIRED) → relevance gate (similarity + category agreement) → Gemini structured output **or** extractive answer → validation (citations ⊆ retrieved, language) → caveats (verification, DEMO_DATA, province-wide scope, foreign-tourist applicability, other areas, customary rules, fabrication). See [AI_IMPLEMENTATION.md](AI_IMPLEMENTATION.md).

## 5. Database implementation

`001_init.sql`: enums for source type and validation status, `knowledge_documents` with `vector(384)`, HNSW cosine index, filter indexes, CHECK constraints (VERIFIED needs validator; DEMO_DATA never VERIFIED), `feedback`, `schema_migrations`. `PgVectorStore` with idempotent upsert. **Type-checked, not executed.** The running MVP uses `MemoryVectorStore` with the same filter semantics.

## 6. Testing results (all executed)

- Server: **46/46** tests passed (knowledge integrity, classifier, pipeline, LLM validation with mocks, API validation/errors/health/feedback).
- Web: **7/7** tests passed (answer card sections, fallback, demo label, feedback, flow, payload, error + retry).
- Typecheck (both workspaces) and production builds: pass. Compiled server started and served `/api/health`.
- Evaluation (real embeddings, extractive mode), 28 scenarios:

| Metric | Tuning (18) | Holdout (10) |
|---|---|---|
| Scenarios passed | 18/18 | 6/10 |
| Top-1 retrieval relevance | 14/14 | 3/7 |
| Grounded response rate | 18/18 | 10/10 |
| Fallback correctness | 4/4 | 3/3 |
| Language consistency | 18/18 | 10/10 |
| Caveat correctness | 18/18 | 10/10 |

Thresholds were tuned on the tuning split, so its 100% is optimistic. Full table: [TESTING.md](TESTING.md), `docs/eval/EVAL_REPORT.md`.

## 7. Deployment status

**Not deployed.** Local only. Vercel config, Dockerfile and compose file are provided but the Docker image build was not run.

## 8. Repository structure

```
localnorm-ai/
├── README.md  .env.example  .gitignore  docker-compose.yml  package.json
├── knowledge/scenarios.json
├── server/  Dockerfile  db/migrations/001_init.sql
│   ├── src/{index,app,bootstrap,config,types,feedback}.ts
│   ├── src/rag/{knowledge,embeddings,vectorStore,pgVectorStore,classifier,prompts,llm,messages,pipeline}.ts
│   ├── src/scripts/{migrate,ingest,eval}.ts   src/eval/scenarios.ts   src/db/pool.ts
│   └── tests/{api,pipeline,classifier,knowledge}.test.ts helpers.ts
├── web/  index.html  vite.config.ts  vercel.json
│   └── src/{App,main}.tsx  App.test.tsx  index.css  lib/{api,i18n,types}.ts
│       components/{Landing,Setup,Chat,AnswerCard,SourceBadge}.tsx
└── docs/ (13 documents + eval/)
```

## 9. Known bugs

- No known crashing bugs.
- Retrieval quality issues (holdout H02, H03: relevant questions rejected as off-topic; H04, H06: wrong document within the right area). Documented in TESTING.md.
- Heuristic language detection may misclassify very short messages (affects only LLM-draft validation and eval).

## 10. Known limitations

See [PRODUCT_LIMITATIONS.md](PRODUCT_LIMITATIONS.md). Most important: nothing verified by a human reviewer or community; no Canggu customary rules; secondary sources for two regulations; small KB.

## 11. Missing credentials / external dependencies

| Needed for | What |
|---|---|
| LLM mode | valid `GEMINI_API_KEY` (the environment's `GOOGLE_API_KEY` was rejected: `API_KEY_INVALID`) |
| pgvector | working Docker Desktop, or a managed Postgres with pgvector (`DATABASE_URL`) |
| Deployment | Vercel account + a container host |
| Verified content | a qualified human reviewer; Desa Adat Canggu / banjar partnership for community content |

## 12. Competition rubric readiness

Strong: MVP functionality (locally), repository quality, documentation, differentiation (classification/verification on every answer). Partial: AI depth (LLM untested; retrieval generalisation), problem relevance (no user research), demo (no public URL/video). See [COMPETITION_ALIGNMENT.md](COMPETITION_ALIGNMENT.md).

## 13. Recommended next steps

1. Valid Gemini key → run `npm run eval` in LLM mode; compare against extractive.
2. Replace the keyword gate with an LLM/cross-encoder relevance check; write a new held-out set and re-measure.
3. ✅ Done in the v2 update (see below).
4. Deploy (Vercel + container host); add CI running tests and eval.
5. Human verification of the 11 official summaries against primary texts; replace secondary links with JDIH/primary URLs.
6. Partner with local representatives for `COMMUNITY_VERIFIED` Canggu content; run a small user study with tourists and newcomers.


## Addendum 2026-11-05 — knowledge base v2

- The knowledge base was rebuilt from the team's `Database/` folder through six gated stages (extract/OCR → structure →
  chunk → embed → PostgreSQL + pgvector → RAG); each gate was confirmed by the team. Details: [KNOWLEDGE_BASE_V2.md](KNOWLEDGE_BASE_V2.md).
- 26 documents processed into 120 chunks (24 documents with chunks): 10 JIDHAT regulations, **Pararem Desa Adat Canggu 3/2025**,
  **Awig-Awig Desa Adat Canggu 2012 (unofficial translation)**, 14 research-pack entries. v1 scenarios retired to `knowledge/legacy/`.
- **pgvector path now executed** (Docker `pgvector/pgvector:pg16`): migrations applied, data loaded, pgvector top-5 identical to exact cosine.
- Cross-lingual retrieval fixed with local query translation (OPUS-MT); rule text is quoted verbatim, never machine-translated.
- Tests: server 57/57, web 8/8. Evaluation: 25/26 (round 1), **10/11 on the round-2 holdout**; remaining weaknesses listed in
  PRODUCT_LIMITATIONS (v2 section).
- Still open: human verification, Desa Adat Canggu review of the awig-awig, LLM key, Docker image build, deployment.
