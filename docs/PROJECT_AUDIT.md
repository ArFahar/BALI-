# Project Audit (Phase 0)

Audit date: 2026-11-03

## 1. Repository state found

- The working folder (`Downloads/PRoject`) holds about 40 unrelated personal folders (theses, other competitions, IoT, ML notebooks). None of them is LocalNorm AI and none contained a React/Express/RAG codebase that could be reused.
- **Conclusion: this is a new project.** It was created in a dedicated subfolder `localnorm-ai/` (new git repository) so nothing existing was touched.

## 2. Environment observations

| Item | Finding | Impact |
|---|---|---|
| Node.js / npm | v23.9.0 / 11.7.0 | OK for Vite 6 + Express 4 + TypeScript |
| Git | 2.43 | OK |
| `GOOGLE_API_KEY` in environment | Present, but **rejected by the Gemini API** (`API_KEY_INVALID`, HTTP 400) | No working LLM credential. Gemini integration is implemented but **not live-tested**. |
| Other LLM keys | None found | Same as above |
| PostgreSQL | v18 installed and running as a Windows service on port 5432; **pgvector extension not installed**; credentials unknown | Cannot use the local Postgres for vector search |
| Docker | CLI installed; Docker Desktop **failed to start** (its own backend error about `dockerInference`) | `pgvector/pgvector` container could not be run; pgvector path **not executed** in this session |
| Internet | Available | Used to research sources and download npm packages + the embedding model |

## 3. Technical risks identified

1. **No live LLM** → the product must still work and stay grounded without one. Mitigation: a deterministic *extractive* generation mode that quotes the retrieved source, plus a full Gemini provider that activates when a valid key is configured.
2. **No pgvector available** → mitigation: a `VectorStore` interface with two implementations (in-memory cosine store used now; `PgVectorStore` + SQL migration ready for Postgres).
3. **Fabrication risk in the knowledge base itself.** There is no publicly available, citable source for Desa Adat Canggu customary rules (awig-awig / pararem). Mitigation: no Canggu customary rule is included; every entry cites a named public source or is labelled `DEMO_DATA`; nothing is marked `VERIFIED` because no human reviewer has checked the primary texts.
4. **Sources change.** The 2023 governor circular (SE 4/2023) was superseded by SE 7/2025 during research. Mitigation: `effective_date`, `last_verified_at`, `EXPIRED` status and documented re-verification.
5. **Multilingual embeddings compress similarity scores** (unrelated questions still score ~0.82). Mitigation: category-agreement gate plus thresholds, measured with an evaluation harness including a held-out set.

## 4. Implementation strategy chosen

- Monorepo with npm workspaces: `server/` (Express + TypeScript), `web/` (React + Vite + TypeScript + Tailwind), `knowledge/` (curated JSON source of truth), `docs/`.
- Local multilingual embeddings (`Xenova/multilingual-e5-small` via transformers.js) so semantic retrieval is real and testable without any API key.
- Build the smallest working vertical slice first (knowledge → retrieval → API → UI), then tests and evaluation, then documentation.

## 5. Process note (honest deviation)

The master prompt asked for the PRD and architecture documents to be written before major implementation. In practice the architecture decisions above were made first, but the PRD/architecture **files** were written after the first working build so they describe what was actually built. Their content was not changed to match the code after the fact beyond describing it accurately.
