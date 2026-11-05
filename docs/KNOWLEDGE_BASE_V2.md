# Knowledge Base v2 — from `Database/` to RAG

Built 2026-11-04/05 through six stages, each closed by an explicit confirmation gate with the team.
v2 **replaces** the 13 hand-written scenarios of v1 (archived in `knowledge/legacy/`, not indexed).

Code: `knowledge/pipeline/` (stages 1–5), `server/src/kb/store.ts` + `server/src/rag/` (stage 6).
Generated reports: `knowledge/processing/STAGE1_REPORT.md` … `STAGE5_REPORT.md`, `docs/eval/EVAL_REPORT.md`.

```mermaid
flowchart LR
  DB["Database/<br/>PDF JIDHAT, Pararem, Awig-awig,<br/>research packs (JSON)"] --> S1
  S1["1 · Extract & clean<br/>pdftotext / Windows OCR<br/>page markers, SHA-256, URLs"] --> G1{{Gate 1}}
  G1 --> S2["2 · Structure<br/>1 unit = 1 Pasal / pack entry<br/>category · applicable_to · scope ·<br/>source_type · validation · page"] --> G2{{Gate 2}}
  G2 --> S3["3 · Chunk<br/>≤480 tokens (e5 limit 512)<br/>context header, sentence-safe,<br/>50–80 token overlap"] --> G3{{Gate 3}}
  G3 --> S4["4 · Embed<br/>multilingual-e5-small q8, 384-d<br/>batch 1 (deterministic)"] --> G4{{Gate 4}}
  G4 --> S5["5 · Store<br/>PostgreSQL 16 + pgvector<br/>documents 1–n chunks"] --> G5{{Gate 5}}
  G5 --> S6["6 · RAG<br/>bilingual query (local MT),<br/>applicability, verbatim quotes"] --> G6{{Gate 6}}
```

## Commands

```bash
npm run kb:build        # stages 1-4 (needs Python 3 + pypdf, poppler pdftotext; OCR via knowledge/pipeline/ocr_windows.ps1)
docker compose up -d db
DATABASE_URL=postgresql://localnorm:localnorm@localhost:5433/localnorm npm run migrate
DATABASE_URL=postgresql://localnorm:localnorm@localhost:5433/localnorm npm run kb:load   # stage 5
```

Without `DATABASE_URL` the server reads the same stage-4 vectors from `knowledge/processing/` (`KB_SOURCE=files`).

## Stage 1 — Source processing

| Group | Documents | Extraction |
|---|---|---|
| A. JIDHAT Provinsi Bali (`jidhat.baliprov.go.id/hukum-negara`, downloaded 2026-11-04) | 24 regulations / circulars | 18 text layer, 6 OCR (Windows OCR, English engine). All 24 SHA-256 match the download index |
| B. Desa Adat Canggu | Pararem No. 3/2025 (waste); Awig-Awig 2012 — unofficial Indonesian translation + original scan | Pararem URL confirmed by downloading it from `jidhat.baliprov.go.id/storage/perarem/…` and matching SHA-256. Awig-awig origin URL unknown; the 122-page Balinese scan is kept as citation target only |
| C. Cultural research pilot | 5 entries (Tri Hita Karana, canang sari, sacred places, desa adat, Galungan) | Structured JSON |
| D. Public behaviour & traffic pack ("…knowledge 2") | 9 entries incl. 3 Canggu entries | Structured JSON; superset of "…knowledge" (6 identical entries), so only the expanded pack is used |

Cleaning removes running headers/footers (lines on ≥40 % of pages), page numbers, table-of-contents leaders and Balinese-script glyph noise; it keeps BAB/Pasal/ayat structure and `<!-- page n -->` markers.

## Stage 2 — Structuring (Gate 2 decisions)

- Scope: high + medium relevance JIDHAT documents, all Canggu documents, all pack entries (12 low-relevance administrative/financial regulations not indexed).
- Unit = one article (Pasal / Pawos) or one pack entry; content is the source text, never paraphrased.
- Category and `applicable_to` are assigned by transparent keyword rules (reviewable), with these safeguards: a conduct rule must contain obligation/prohibition/sanction wording; administrative, financial, inheritance/marriage articles are excluded; glossary articles are filtered per definition.
- `applicable_to`: `everyone`, `foreign_tourist`, `domestic_tourist`, `tamiu` (non-members incl. foreigners — Pararem Pasal 1), `krama_tamiu`, `krama_adat`, `business`. **Awig-awig articles with no explicit subject default to `krama_adat`** (Gate 2: conservative).
- Source classes: JIDHAT, Pararem, Awig-awig → `OFFICIAL` (`government_regulation` / `customary_law`); research packs → `GENERAL_ADVISORY`. Status: `UNDER_REVIEW` (official) / `UNVERIFIED` (packs). **Nothing is `VERIFIED`; nothing is `COMMUNITY_VERIFIED`.**
- Flags travel with every chunk: `UNOFFICIAL_TRANSLATION`, `EDITION_2012_VALIDITY_UNCONFIRMED`, `SOURCE_URL_UNKNOWN`, `OCR_TEXT`, `OCR_COLUMN_ORDER_ISSUES`, `LOCAL_REVIEW_REQUIRED`, `HISTORICAL_2022_AGREEMENT`, `PRIMARY_URL_UNREACHABLE`, `SUMMARY_OF_FOREIGN_TOURIST_CIRCULAR`.
- Awig-awig `page_number` = page of the **original scan** where the article starts (translation pages carry `RUJUKAN: PDF SUMBER HALAMAN n`).

## Stage 3 — Chunking

Real token counts from the e5 tokenizer. Cap 480 tokens incl. header (model limit 512) — a deliberate deviation from the suggested 300–600. Sentences and enumerations are never cut; long articles split with 50–80 tokens of whole-sentence overlap; short consecutive articles merge only when document, chapter, category and applicability match. Every chunk starts with a context header (document · article · chapter).

Final: **120 chunks** (min 60 / median 256 / max 457 tokens), 0 over cap, 0 duplicates, 0 word-level cuts.

| Category | Chunks |
|---|---|
| environmental_etiquette | 34 |
| neighborhood_etiquette | 20 |
| customary_context | 18 |
| sacred_places | 15 |
| religious_etiquette | 12 |
| social_interaction | 9 |
| traffic_etiquette | 7 |
| public_behavior | 5 |

## Stage 4 — Embeddings

`Xenova/multilingual-e5-small` (upstream `intfloat/multilingual-e5-small`), ONNX q8, transformers.js 3.7.6, mean pooling, L2-normalised, `passage:`/`query:` prefixes, 384-d. ONNX file SHA-256 and chunk-file SHA-256 are recorded in `manifest.json` and in `knowledge_ingest_runs`.

**Batch size 1 on purpose:** the q8 model quantises activations per batch; embedding in batches of 8 changed vectors by up to 1.1×10⁻² depending on batch neighbours. With batch 1, re-embedding drift is 0.

## Stage 5 — PostgreSQL + pgvector

`server/db/migrations/002_knowledge_base.sql`: `knowledge_documents` (UUIDv5 id, `document_key`, source metadata, flags, CHECKs: VERIFIED/COMMUNITY_VERIFIED need a named validator) → `knowledge_chunks` (UUIDv5 id, `chunk_key`, metadata, `vector(384)`, HNSW cosine, GIN on `applicable_to`) + `knowledge_ingest_runs`. The v1 table was renamed `legacy_scenario_chunks`.

Loader (`stage5_load.mjs`) refuses stale vectors (content hash), upserts in one transaction, deletes rows no longer produced, and verifies that pgvector top-5 equals exact cosine (4/4 probes). With ~120 rows PostgreSQL uses a sequential scan; HNSW applies as the corpus grows.

**Supabase (5 November 2026):** the same loader was run against a Supabase project (PostgreSQL 17.11,
pgvector 0.8.2): 24 documents, 120 chunks, pgvector order equal to exact cosine on 4/4 probes. Tables have RLS enabled
(migration 003). See [DEPLOYMENT.md](DEPLOYMENT.md#2-database-supabase-postgresql--pgvector).

## Stage 6 — RAG

1. Classify the question (category keywords EN/ID incl. plurals, language, out-of-Bali, other Bali areas, customary-rule request, fabrication attempt).
2. **Translate the question** to the other language with local OPUS-MT (`Xenova/opus-mt-en-id`, `opus-mt-id-en`, q8), one sentence at a time, plus a domain glossary (temple→pura, shrine→pelinggih, rubbish→sampah, …). Search with both texts; keep the best score per chunk.
3. Filter: score ≥ 0.80 and (category agrees with the classifier or score ≥ 0.86); not `EXPIRED`; scope ∈ {canggu, badung, bali, indonesia}. Rank penalty 0.015 when `applicable_to` does not address the user type, 0.01 for background (`customary_context`).
4. Answer (no LLM key available, so extractive):
   - research-pack entry in the user's language → its definition/context, significance, Do / Avoid lists;
   - otherwise a framing sentence in the user's language (what the source is, which article) **plus the verbatim passage in its original language** — the best contiguous passage, never scattered sentences, never cutting an enumeration ("kecuali: a. …; b. …").
   - With `GEMINI_API_KEY`, Gemini writes the answer from the same chunks; drafts without valid citations or in the wrong language are discarded.
5. Caveats from metadata: not verified; province-wide only; provision addressed to krama adat / businesses; foreign-tourist circular for newcomers; unofficial 2012 translation; 2022 agreement; OCR; customary rules decided locally; quoted in original language; **no fine stated** when a fine is asked and the passage states none; no customary provision found.

**Why rule text is never machine-translated:** in testing, `opus-mt-id-en` rendered "dalam satu wuku (tujuh hari)" as "in one day" and "prajuru adat" as "customs"; protecting terms with placeholders failed too. MT is used only to *find* sources.

## Evaluation (measured, extractive mode, pgvector)

| Round | Scenarios | When written | Result |
|---|---|---|---|
| 1 (V01–V26) | 26 | before running v2; thresholds from v1 unchanged | **25/26**; top-1 source 22/22. V21 (rent price) wrongly answered |
| 2 (H01–H11) | 11 | after fixing V21/V26, before running on them | **10/11** — H01 failed together with a V01 regression caused by the V21 fix (`docs/eval/EVAL_REPORT_round2_before_fix.md`) |
| After fixes | 37 | all seen | 37/37 — optimistic by construction |

v1 holdout for comparison: top-1 3/7. Cross-lingual before query translation (Stage 4 probe): correct Indonesian chunk at rank 19 / 60 / 3 / 18 for English questions; after: rank 1 in all evaluated cases.

**Qualitative findings the metrics miss** (read the answers, not only the source ids):
- V26 "customary fine for drones at a temple" cites awig Pasal 22 (paruman planning) — related document, not an answer; it now carries "the source shown does not state a fine".
- V09 "climbing a pelinggih" cites Pergub 25/2020 Pasal 13 (temple maintenance, sanctity) — relevant, but does not literally prohibit climbing; status WEAK_MATCH.
- Exploratory probes after round 2 (not in the scored set): "rent for a villa per month" → still answered (keyword *villa* opens the gate); "cheaper to rent a scooter or a car" → parking etiquette; "just moved, register with the banjar" → awig Pasal 37 (detaining stray animals, which also says "melapor kepada prajuru") instead of Pasal 4.

## LLM generation with knowledge base v2 (SumoPod / DeepSeek)

The SumoPod integration (`server/src/rag/llm.ts`, `SumoPodClient`, model `deepseek-v4-flash`) now runs on top of the v2
knowledge base; nothing about retrieval changes when a key is set.

| Step | Without LLM | With `LLM_PROVIDER=sumopod` |
|---|---|---|
| Query translation | local OPUS-MT (Vercel: glossary terms) | local OPUS-MT; on Vercel the LLM (`QUERY_TRANSLATOR=llm`, `TRANSLATE_TIMEOUT_MS`, falls back to glossary terms on error) |
| Retrieval + relevance gate | unchanged | unchanged (up to 3 chunks) |
| Answer | framing sentence + verbatim quote | LLM answer in the user's language from the v2 prompt (`prompts.ts`: source subtype, `applies_to`, flags, page) |
| Verbatim quote | quoted chunk | passage of the **first cited legal source**, still in its original language, shown beside the AI answer |
| Validation | n/a | `validateDraft`: must cite retrieved sources (`S1..S3`), answer in the selected language; otherwise extractive |
| Extra caveat | none | "AI-written summary … where it differs from the source text, the source text prevails" |

Machine translation of *rule text* is still not used. The LLM paraphrases with the source in front of it, and the
original passage stays visible so the paraphrase can be checked.

**Status (honest):** covered by unit tests with a mocked provider (`server/tests/llm.test.ts`, `pipeline.test.ts`).
Not yet run live against SumoPod with v2 data and not yet scored with `npm run eval` in LLM mode; the 4 November 2026
smoke test used the retired v1 knowledge base. The evaluation figures in this document are extractive mode.

## What a human must still do

1. Verify the official summaries against the primary PDFs and set `VERIFIED` + `validated_by`.
2. Confirm with Desa Adat Canggu whether the 2012 awig-awig is current, obtain an official translation/source URL, and review the `krama_adat` default per article.
3. Confirm the 2022 noise agreement and the SE 7/2025 primary PDF (404).
4. Review keyword-assigned categories/applicability in `STAGE2_REPORT.md`.
