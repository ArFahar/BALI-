# API Documentation

Base URL: `http://localhost:8787` (dev). All bodies are JSON (`content-type: application/json`, max 16 kB). Rate limit: 30 requests / minute / IP on `/api/*` (standard `RateLimit-*` headers). CORS: origins from `CORS_ORIGIN`.

## Error format

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid", "details": [{ "field": "language", "message": "..." }] } }
```

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body fails schema (details list each field) |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 16 kB |
| 404 | `NOT_FOUND` | Unknown `/api/*` route |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected error (details only in server logs) |
| 503 | — | `/api/health` when the vector store is unreachable or empty |

---

## POST /api/chat

Process a question and return a grounded answer.

### Request

| Field | Type | Rules |
|---|---|---|
| `message` | string | trimmed, 2–1000 chars |
| `language` | `"en"` \| `"id"` | answer language |
| `user_type` | `"tourist"` \| `"newcomer"` | |
| `location` | `"canggu"` | only value supported in the pilot |
| `conversation_id` | uuid | optional; returned by the first response |

### Response 200

| Field | Type | Description |
|---|---|---|
| `conversation_id` | uuid | Reuse for follow-ups |
| `answer` | string | Guidance (or fallback message) in `language` |
| `why_it_matters` | string \| null | Cultural/social reason |
| `category` | string \| null | One of the 8 categories |
| `recommended_actions` | string[] | Concrete actions |
| `sources` | SourceRef[] | Cited documents (empty for fallbacks) |
| `source_classification` | string[] | Distinct `source_type`s of cited sources |
| `caveats` | string[] | Verification, applicability, scope, customary-rule and refusal notes |
| `retrieval_status` | `MATCHED` \| `WEAK_MATCH` \| `NO_MATCH` \| `OUT_OF_SCOPE` \| `OFF_TOPIC` | Retrieval outcome |
| `confidence` | `high` \| `medium` \| `low` \| `none` | `high` only if matched **and** all sources VERIFIED |
| `fallback_used` | boolean | True when no grounded answer was given |
| `generation_mode` | `llm` \| `extractive` \| `fallback` | How the text was produced |
| `language` | `en` \| `id` | |

`SourceRef`: `id`, `title`, `source_name`, `source_url`, `source_type`, `validation_status`, `effective_date`, `location`, `applies_to[]`, `is_demo_data`, `relevance` (cosine similarity, 3 d.p.).

### Example (real output, extractive mode)

```bash
curl -s -X POST localhost:8787/api/chat -H 'content-type: application/json' \
  -d '{"message":"Do I need a helmet on a scooter?","language":"en","user_type":"tourist","location":"canggu"}'
```

```json
{
  "conversation_id": "4f235a73-4189-49aa-95a6-0bf4c7e1e5c9",
  "answer": "Under Indonesian Law No. 22 of 2009 (Article 106(8)), every motorcycle rider and passenger must wear a helmet meeting the Indonesian national standard (SNI); Article 291(1) sets a penalty of up to one month's detention or a fine of up to IDR 250,000 ...",
  "why_it_matters": "Scooter accidents are a common cause of injury for visitors, ...",
  "category": "traffic",
  "recommended_actions": ["Always wear a fastened helmet, and make sure your passenger does too.", "..."],
  "sources": [{
    "id": "ln-010",
    "title": "Helmets, driving licences and riding scooters",
    "source_name": "Undang-Undang No. 22 Tahun 2009 tentang Lalu Lintas dan Angkutan Jalan (Pasal 106 ayat 8, Pasal 291 ayat 1); SE Gubernur Bali No. 7 Tahun 2025",
    "source_url": "https://peraturan.bpk.go.id/Details/38654/uu-no-22-tahun-2009",
    "source_type": "OFFICIAL_REGULATION",
    "validation_status": "UNDER_REVIEW",
    "effective_date": "2009-06-22",
    "location": "indonesia",
    "applies_to": ["everyone"],
    "is_demo_data": false,
    "relevance": 0.87
  }],
  "source_classification": ["OFFICIAL_REGULATION"],
  "caveats": [
    "The sources used have not yet been verified by a local reviewer (status: under review / unverified). Please treat this as guidance and check the original source.",
    "These sources apply to Bali (or Indonesia) as a whole; no Canggu-specific verified rule was found for this question."
  ],
  "retrieval_status": "MATCHED",
  "confidence": "medium",
  "fallback_used": false,
  "generation_mode": "extractive",
  "language": "en"
}
```

### Example — out of scope

```json
{ "answer": "This pilot only covers Canggu, Bali. I don't have verified guidance for Lombok, and rules from Bali should not be assumed to apply there.",
  "sources": [], "retrieval_status": "OUT_OF_SCOPE", "confidence": "none", "fallback_used": true, "generation_mode": "fallback", "...": "..." }
```

### Example — validation error (400)

```json
{"error":{"code":"VALIDATION_ERROR","message":"Request body is invalid","details":[
  {"field":"message","message":"message is too short"},
  {"field":"language","message":"Invalid enum value. Expected 'en' | 'id', received 'fr'"},
  {"field":"location","message":"location must be \"canggu\" — the MVP pilot supports Canggu only"}]}}
```

---

## GET /api/knowledge/categories

```json
{ "location": "canggu",
  "categories": [
    { "id": "neighborhood", "label": { "en": "Neighbourhood etiquette", "id": "Etika bertetangga" }, "documents": 1 },
    { "id": "waste_management", "label": { "en": "Waste management", "id": "Pengelolaan sampah" }, "documents": 2 },
    "... 8 entries; documents = scenarios not EXPIRED ..."
  ] }
```

## GET /api/health

200 when the vector store responds and contains chunks, otherwise 503 with `"status": "degraded"`. Never includes keys or connection strings.

```json
{ "status": "ok", "version": "0.1.0",
  "dependencies": {
    "vector_store": { "kind": "memory", "ok": true, "chunks": 26 },
    "embeddings": { "provider": "local:Xenova/multilingual-e5-small", "ok": true },
    "llm": { "provider": null, "configured": false, "note": "No LLM key configured; answers use extractive grounded mode." },
    "feedback_store": "file" },
  "time": "2026-11-03T08:07:06.378Z" }
```

`llm.configured` means a key is set; it does not prove the key works (a bad key surfaces as extractive answers plus a server log warning).

## POST /api/feedback

| Field | Type | Rules |
|---|---|---|
| `conversation_id` | uuid | required |
| `message_id` | string | optional, ≤ 100 |
| `rating` | `helpful` \| `not_helpful` | required |
| `comment` | string | optional, ≤ 500 |
| `source_ids` | string[] | optional, `ln-NNN`, ≤ 10 |
| `language` | `en` \| `id` | optional |

Response `201 {"status":"recorded"}`.
