# Testing & Quality Assurance

All results below were produced by actually running the commands on 2026-11-03 (Windows 11, Node 23.9).

## 1. Automated tests

```bash
npm test                     # both workspaces
npm test --workspace server  # vitest + supertest
npm test --workspace web     # vitest + Testing Library (jsdom)
```

**Result: server 46/46 passed, web 8/8 passed (8th: context form inside the hero → chat with the chosen user type and language).**

| Area (master prompt) | Where | What is asserted |
|---|---|---|
| 1. Backend health | `server/tests/api.test.ts` | 200 + dependency report without secrets; 503 `degraded` when store is down |
| 2. API validation | `api.test.ts` | empty/oversized message, bad language, bad user_type, non-Canggu location, bad uuid → 400 with field; malformed JSON → `INVALID_JSON`; feedback rating; 404 JSON |
| 3. RAG retrieval | `pipeline.test.ts` | expected top document for EN and ID questions |
| 4. Source attribution | `pipeline.test.ts`, `api.test.ts` | sources carry URL, type, status; response shape |
| 5. Indonesian questions | `pipeline.test.ts` | ID question → ID chunk, ID caveats |
| 6. English questions | `pipeline.test.ts` | |
| 7. Location filtering | `pipeline.test.ts` | scope filter returns only allowed scopes; status filter excludes statuses |
| 8. Empty retrieval | `pipeline.test.ts` | no match → `NO_MATCH`, no sources, "won't guess"; off-topic → `OFF_TOPIC` |
| 9. Hallucination prevention | `pipeline.test.ts`, `knowledge.test.ts` | LLM draft without citations / out-of-range citations / wrong language rejected; LLM error → extractive; customary-rule + fabrication caveats; KB integrity (no VERIFIED without validator, DEMO_DATA never VERIFIED, no fake COMMUNITY_VERIFIED) |
| 10. Error handling | `api.test.ts`, `web/src/App.test.tsx` | typed API errors; UI error alert + retry on network failure |
| 11. Frontend responsiveness | manual (in-app browser) | 375 px viewport: no horizontal scroll with an answer rendered. No automated visual test. |
| UI flow | `App.test.tsx` | landing → setup → chat; suggested question; correct payload (language, user_type, location); answer card sections; fallback card; demo label; feedback |

Unit tests use a deterministic hash embedder so they run in ~2 s without downloading a model. **Real retrieval quality is measured by the evaluation harness below, not by unit tests.**

## 2. Evaluation harness (real embeddings)

```bash
npm run eval   # writes docs/eval/EVAL_REPORT.md and docs/eval/eval-results.json
```

Runs every scenario in `server/src/eval/scenarios.ts` through the real pipeline (`local:Xenova/multilingual-e5-small`, memory store, **extractive mode — no LLM**).

### Scenario coverage (28 total)

| Kind | Tuning (E01–E18) | Holdout (H01–H10) |
|---|---|---|
| Normal questions with sources | 10 | 5 |
| Cross-lingual (EN question, ID answer) | 1 | — |
| No available source | 2 | 2 |
| Ambiguous local rule | 1 | 1 |
| Regulation with limited applicability | 1 | — |
| Outside Canggu pilot scope | 2 | 1 |
| Attempts to make the AI invent customary rules | 2 | 1 |

### Metric definitions

- **Retrieval relevance (top-1):** for answerable scenarios, the first cited source is one of the expected documents.
- **Citation correctness:** same as above *and* the response is grounded (extractive mode cites only the quoted document, so these coincide).
- **Grounded response rate:** non-fallback answers have ≥ 1 source; fallbacks have none.
- **Fallback correctness:** for scenarios that must not be answered from the KB, the status is one of the expected fallback statuses.
- **Language consistency:** detected language of answer + why = selected language (heuristic detector).
- **Caveat correctness:** required caveat present (applicability, banjar/DEMO_DATA, customary refusal, other-area).

### Results (measured)

Thresholds were calibrated on the **tuning** split. The **holdout** split was written afterwards and the system was **not** changed in response to it.

| Metric | All | Tuning | Holdout |
|---|---|---|---|
| Scenarios passed | 24/28 | 18/18 | 6/10 |
| Retrieval relevance (top-1) | 81.0% (17/21) | 100.0% (14/14) | **42.9% (3/7)** |
| Citation correctness | 81.0% (17/21) | 100.0% (14/14) | 42.9% (3/7) |
| Grounded response rate | 100.0% (28/28) | 100.0% | 100.0% |
| Fallback correctness | 100.0% (7/7) | 100.0% (4/4) | 100.0% (3/3) |
| Language consistency | 100.0% (28/28) | 100.0% | 100.0% |
| Caveat correctness | 100.0% (28/28) | 100.0% | 100.0% |

The tuning numbers are optimistic by construction. **The holdout figure (3 of 7 answerable questions correctly retrieved) is the better estimate of real-world retrieval quality, and it is small-sample.**

### Holdout failures (analysis)

| ID | Question | Outcome | Cause |
|---|---|---|---|
| H02 | "Di mana saya harus menukar uang dolar dengan aman?" | `OFF_TOPIC` fallback | "menukar uang" not in keyword list (only "tukar uang") → category gate rejected a relevant doc |
| H03 | "Can I take a freelance design job while on a tourist visa?" | `OFF_TOPIC` fallback | "job"/"visa"/"freelance" not in keyword list |
| H04 | "Bolehkah saya berboncengan bertiga di satu motor?" | cited ln-011 (drink-riding) instead of ln-010 | both traffic; embedding ranked the wrong traffic doc |
| H06 | "Which day does the banjar collect rubbish on my street?" | cited ln-007 (noise, DEMO_DATA) instead of ln-009 | "banjar" pulled the neighbourhood doc; the KB has no collection schedules anyway |

All four failures are **safe failures**: two honest fallbacks and two wrong-but-labelled sources (no invented content). None produced text not present in the knowledge base.

### Change log during calibration (tuning split only)

1. First run 15/18: "from Jakarta" wrongly triggered `OUT_OF_SCOPE`; off-topic questions (surf times, rent) scored 0.83–0.84 and were answered. → origin-phrase handling + category-agreement gate.
2. 17/18: awig-awig request returned `OFF_TOPIC` instead of `NO_MATCH`. → customary requests count as on-topic.
3. Extractive mode was mixing actions from a second, loosely related document (seen in the browser on the Nyepi question). → cite and quote only the top document.

## 3. Manual end-to-end check

- `npm run dev` (API on 8787, web on 5173); in-app browser at 375 × 812: landing → setup (Newcomer) → suggested question "What should I do during Nyepi?" → answer card with status, General advice + source badges, guidance, why, actions, notes (not verified, province-wide, foreign-tourist applicability), sources. No horizontal scroll.
- `curl` checks of `/api/health`, `/api/chat` (EN, ID, out-of-scope), validation errors — outputs reproduced in API_DOCUMENTATION.md.
- Compiled build (`node server/dist/index.js`) started and served `/api/health`.

## SumoPod integration check (4 November 2026)

- Eight provider tests cover authentication/request format, HTTP errors without logging response bodies, malformed JSON, invalid fields, null/empty content, truncated responses and timeout. Existing pipeline tests cover rejected citations and the extractive fallback.
- Live SumoPod `deepseek-v4-flash`: the Indonesian question "Apakah saya wajib memakai helm saat mengendarai sepeda motor?" returned `generation_mode: llm`, source `ln-010`, in about 7 seconds. One earlier attempt fell back because the generated fields failed validation; the provider prompt was then made explicit about field types and categories.
- This is one live smoke test, not a re-run of the evaluation dataset. Previous tuning/holdout figures above remain extractive-only.

## 4. Not tested

- Live Gemini generation and Gemini embeddings (no valid key).
- PostgreSQL + pgvector path (`npm run migrate`, `npm run ingest` with `VECTOR_STORE=pgvector`, `PgVectorStore.search`) — not executed; Docker Desktop failed to start and the local Postgres has no pgvector.
- Docker image build.
- Real users, real devices, screen readers, load testing.
