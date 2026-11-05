# Product Limitations (disclosed)

## Knowledge base v2 (current)

1. **Nothing is VERIFIED** and nothing is COMMUNITY_VERIFIED. Official texts are `UNDER_REVIEW`, research-pack summaries `UNVERIFIED`.
2. **Awig-Awig Desa Adat Canggu:** an unofficial Indonesian translation (made via OCR of the Latin-script Balinese text) of the
   **2012 edition**; whether it is still in force is not confirmed; its source URL is unknown. Desa Adat Canggu has not reviewed it.
3. Articles of the awig-awig with no explicit subject are tagged `krama_adat` (conservative); answers present them as local
   practice, not as visitor obligations. This default has not been reviewed article by article.
4. Category and applicability metadata were assigned by keyword rules (sample precision roughly two in three before tightening);
   they need human review (`knowledge/processing/STAGE2_REPORT.md`).
5. **Without an LLM**, English users receive an English framing sentence and the **Indonesian** rule text. Machine translation
   was tested and rejected for rule text ("satu wuku (tujuh hari)" → "one day").
6. Query translation (OPUS-MT) is imperfect ("shrine" → "kuil", "Nyepi" → nonsense); it only affects which sources are found.
7. Retrieval still makes labelled mistakes on unseen wording: rent prices answered via the keyword "villa"; "register with the
   banjar" → awig Pasal 37 (stray animals) instead of Pasal 4. 10/11 on the round-2 holdout.
8. OCR text (6 PDFs) has spelling errors; Pergub 58/2025 (Sipandu Beradat) lost its column order and yielded no chunks.
9. Research-pack entries summarise SE Gubernur Bali 7/2025, whose primary PDF returned HTTP 404; the 2022 Canggu noise limits are
   historical and may have changed.
10. 12 low-relevance JIDHAT documents (finance, administration) are not indexed; 2 indexed documents produced no chunks.
11. **LLM paraphrase faithfulness is not measured.** LLM mode passed 35/37 on retrieval, citation, language and caveat checks,
    but no metric scores whether the summary is faithful; a manual review found one small extension. The verbatim source
    text is available beside every LLM answer and prevails.

The v1 list below is kept for history.

## Knowledge & validation

1. **Nothing is VERIFIED.** All 13 scenarios are `UNDER_REVIEW` (official summaries) or `UNVERIFIED` (2 editorial DEMO_DATA entries). No human reviewer has checked them against primary texts. The app says so on every answer.
2. **No community validation.** No Desa Adat Canggu, banjar or other community representative has reviewed or endorsed any content. There is no `COMMUNITY_VERIFIED` content.
3. **No Canggu-specific rules.** All official sources are province-wide (Bali) or national. The only Canggu-scoped entry is DEMO_DATA. Customary rules (awig-awig, pararem, customary fines) are deliberately not included.
4. **Secondary sources.** SE Gubernur Bali 7/2025 content comes from a CNA Indonesia news report because the official PDF was unreachable (HTTP 404) during research; Pergub 47/2019 links to a secondary copy (BASAbali Wiki).
5. **Small coverage.** 13 scenarios. Many reasonable questions (visas, rent, medical, specific businesses, events) fall back.
6. **Time sensitivity.** Rules change (SE 4/2023 → SE 7/2025 during this project). The Nyepi entry describes the 2024 observance; dates change yearly. Levy amount may change.
7. **Many rules address foreign tourists only**; the app adds a caveat for newcomers but cannot determine a user's nationality or visa status.

## AI & retrieval

8. **Limited live LLM verification.** On 4 November 2026, SumoPod `deepseek-v4-flash` passed one Indonesian question with `generation_mode: llm` and a retrieved citation. No full LLM evaluation has been run; existing evaluation figures are extractive-only. Gemini remains untested live. Citation validation is not a guarantee of semantic accuracy.
9. **Retrieval generalises poorly.** Held-out top-1 retrieval: 3/7 (42.9%). The keyword-based category gate rejects relevant questions with unfamiliar wording; the embedding sometimes picks the wrong document within a category. Failures observed so far were safe (fallback or wrong-but-labelled source), but users will see "not in knowledge base" more often than they should.
10. **Language detection is heuristic** (stopword counts) and can misjudge very short or mixed-language text.
11. **Relevance scores are not probabilities.** `relevance` is cosine similarity from e5-small; `confidence` is a coarse rule.

## Engineering

12. **pgvector path not executed.** Migration, ingest-to-Postgres and SQL search are implemented and type-checked, but were not run (Docker Desktop failed to start; local Postgres lacks pgvector).
13. **Deployed on Vercel, 4 November 2026.** Frontend and API are hosted together at https://localnorm.vercel.app. Docker image build remains untested. The production vector store is in-memory; feedback files in `/tmp` are temporary and not shared between instances.
14. **Conversation memory is in-process** — lost on restart, not shared across instances; no persistent chat history.
15. **First start downloads ~120 MB** (embedding model) and the first ingest took ~3 minutes on the development laptop.
16. No automated visual/responsive tests, no screen-reader testing, no load testing.

## Product

17. The problem statement is a **hypothesis**; there is no user research yet.
18. LocalNorm is not legal advice and is not a substitute for asking local people. It does not and cannot resolve conflicts or address overtourism.
