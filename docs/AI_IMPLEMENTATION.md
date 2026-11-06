# AI and RAG implementation

Mawacara AI uses `server/src/rag/pipeline.ts` to coordinate retrieval, generation, and response validation. Source processing is documented in [KNOWLEDGE_BASE_V2.md](KNOWLEDGE_BASE_V2.md). This document describes the current runtime rather than the retired v1 scenarios.

## Input and retrieval

1. `POST /api/chat` validates the message, language, user type, location, and optional conversation ID with Zod.
2. `classifier.ts` detects categories, language, location mentions, and customary-rule or fabrication requests using keyword rules.
3. Follow-ups shorter than five words reuse the previous user question for retrieval. Query translation and a domain glossary help reach sources in the other language. Translation affects retrieval, not the original rule text.
4. Query vectors use `Xenova/multilingual-e5-small`, quantised ONNX, mean pooling, L2 normalisation, and 384 dimensions. The indexed vectors must use the same model as queries.
5. Search includes Canggu, Badung, Bali, and Indonesia scopes and excludes expired sources. The current store can be file-backed or PostgreSQL/pgvector; Vercel explicitly uses `KB_SOURCE=files` with 120 precomputed chunks. Both source languages are searchable.
6. Candidates need similarity at least 0.80 and either a matching category or similarity at least 0.86. Applicability and background-content penalties adjust ranking. Up to three chunks within 0.03 of the best adjusted rank become model context.

These thresholds are configuration defaults, not calibrated probabilities. Keyword rules and retrieval can miss relevant sources or select related passages that do not answer the question.

## Generation and reasoning modes

Production uses SumoPod's OpenAI-compatible `/v1/chat/completions` API with `deepseek-v4-flash`, temperature 0.2, and JSON output. Optional Gemini support remains in the code but has not been verified live here. On Vercel, SumoPod also translates queries; locally, OPUS-MT or glossary-only translation can be selected.

The model proposes a reasoning mode; `controlDraft` determines the accepted result:

| Mode | Behaviour |
|---|---|
| `grounded` | Cites retrieved sources without declared general-knowledge or inference claims. |
| `hybrid` | Combines retrieved sources with labelled general knowledge or inference. |
| `general` | No supporting sources are shown. Allowed only for low/medium-risk questions and labelled with caveats. |
| `abstain` | Does not answer the requested rule and suggests confirmation where appropriate. |

`risk.ts` classifies permission, obligation, legal, ritual, and sanction questions as high risk using deterministic rules. High-risk questions without retrieved context are not sent to the model. The controller rejects general-only answers for high-risk questions even if the model proposes one. Keyword risk detection can misclassify wording.

The response also has a separate `generation_mode`: `llm`, `extractive`, or `fallback`. Provider errors, malformed output, empty answers, invalid citation identifiers, or detected language mismatches lead to an extractive answer if context exists, otherwise a fallback. An explicit model abstention returns a limitation response rather than an unrelated quotation. Out-of-scope requests are handled separately.

## Validation and source presentation

`controlDraft` rejects citations outside the retrieved set. Source claims without valid claim citations are relabelled as inference. It does not check semantic entailment: a valid source ID does not prove that the cited text supports every statement. Language detection is heuristic and may return no decision.

Source classification, verification status, applicability, dates, and warning flags come from metadata. For sourced LLM answers, the first cited legal passage is available in its original language. Extractive answers preserve contiguous source text and exceptions within enumerations. General-knowledge answers have no source quote.

No current document is human-verified or community-verified. The Canggu awig-awig is an unofficial Indonesian translation of the 2012 text with unconfirmed current validity and an unknown original URL. These limitations remain attached to source metadata even though the display title is shorter.

User messages are delimited as data, and prompts instruct the model not to invent rules or follow injected instructions. These controls reduce risk; they do not guarantee accurate or injection-proof answers.

## Configuration and evaluation

Set `LLM_PROVIDER=sumopod`, `SUMOPOD_MODEL=deepseek-v4-flash`, `SUMOPOD_BASE_URL=https://ai.sumopod.com/v1`, and a server-only `SUMOPOD_API_KEY`. Production uses a 35-second generation timeout and a 5-second translation timeout; cold starts and retrieval can add latency beyond those calls. The web client times out after 45 seconds. Never expose keys through `VITE_` variables.

Tests cover the active controller through both direct validation tests and pipeline scenarios, including grounded/hybrid/general modes, high-risk abstention, invalid citations, language mismatches, and provider failure. Measured LLM evaluation results and their tuning/holdout limitations are in [eval/llm/EVAL_REPORT.md](eval/llm/EVAL_REPORT.md); these checks do not establish paraphrase faithfulness or production accuracy on unseen questions.

Conversation history is held in process memory (up to 500 conversations, six turns each). File feedback on Vercel is temporary and not shared across instances. PostgreSQL is supported but not active in the current deployment.
