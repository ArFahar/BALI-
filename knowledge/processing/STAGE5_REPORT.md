# Stage 5 report - PostgreSQL + pgvector (generated)

Server: PostgreSQL 17.11, pgvector 0.8.2.

## Contents

| check | result |
|---|---|
| documents | 24 (expected 24) ✅ |
| chunks | 120 (expected 120) ✅ |
| vectors with 384 dimensions | 120 ✅ |
| vector round-trip max abs error (2 samples) | 0.00e+0 ✅ |
| indexes on knowledge_chunks | knowledge_chunks_applicable_idx, knowledge_chunks_chunk_key_key, knowledge_chunks_document_idx, knowledge_chunks_embedding_idx, knowledge_chunks_filter_idx, knowledge_chunks_pkey |
| query plan (top-5 by cosine) | Limit  (cost=33.17..33.18 rows=5 width=40) |   InitPlan 1 |     ->  Limit  (cost=0.00..0.09 rows=1 width=32) |           ->  Seq Scan on knowledge_chunks knowledge_chunks_1  (cost=0.00..27.12 rows=312 width=32) |   ->  Sort  (cost=33.08..33.86 rows=312 width=40) |         Sort Key: ((knowledge_chunks.embedding <=> (InitPlan 1).col1)) |         ->  Seq Scan on knowledge_chunks  (cost=0.00..27.90 rows=312 width=40) |

## Chunks per category

| category | chunks |
|---|---|
| environmental_etiquette | 34 |
| neighborhood_etiquette | 20 |
| customary_context | 18 |
| sacred_places | 15 |
| religious_etiquette | 12 |
| social_interaction | 9 |
| traffic_etiquette | 7 |
| public_behavior | 5 |

## Chunks per source type / validation status

| source_type | validation_status | chunks |
|---|---|---|
| GENERAL_ADVISORY | UNVERIFIED | 18 |
| OFFICIAL | UNDER_REVIEW | 102 |

## pgvector search vs exact cosine (top 5, no filters)

With ~120 rows PostgreSQL may use a sequential scan instead of the HNSW index; both must return the exact order.

**Saya menyewa rumah di Canggu selama dua bulan. Apakah saya wajib melapor ke banjar?** — pgvector order equals exact cosine: ✅

1. `0.877` CANGGU-AWIG-2012-ID::Pasal-4#1 — neighborhood_etiquette · OFFICIAL/UNDER_REVIEW · applies to tamiu, krama_adat
2. `0.873` CANGGU-AWIG-2012-ID::Pasal-32#1 — sacred_places · OFFICIAL/UNDER_REVIEW · applies to krama_adat
3. `0.870` CANGGU-AWIG-2012-ID::Pasal-37#1 — neighborhood_etiquette · OFFICIAL/UNDER_REVIEW · applies to everyone
4. `0.870` CANGGU-AWIG-2012-ID::Pasal-39+1#1 — neighborhood_etiquette · OFFICIAL/UNDER_REVIEW · applies to krama_adat
5. `0.866` CANGGU-AWIG-2012-ID::Pasal-22#1 — sacred_places · OFFICIAL/UNDER_REVIEW · applies to krama_adat

**Bagaimana cara memilah sampah rumah tangga di vila saya di Canggu?** — pgvector order equals exact cosine: ✅

1. `0.859` CANGGU-PARAREM-03-2025::Pasal-6#1 — environmental_etiquette · OFFICIAL/UNDER_REVIEW · applies to tamiu, krama_tamiu, krama_adat, everyone
2. `0.852` CANGGU-PARAREM-03-2025::Pasal-1#1 — customary_context · OFFICIAL/UNDER_REVIEW · applies to foreign_tourist, tamiu, krama_tamiu, krama_adat, everyone
3. `0.851` CANGGU-PARAREM-03-2025::Pasal-7#1 — environmental_etiquette · OFFICIAL/UNDER_REVIEW · applies to business
4. `0.850` CANGGU-PARAREM-03-2025::Pasal-7#2 — environmental_etiquette · OFFICIAL/UNDER_REVIEW · applies to business
5. `0.850` CANGGU-PARAREM-03-2025::Pasal-10#1 — neighborhood_etiquette · OFFICIAL/UNDER_REVIEW · applies to tamiu, krama_tamiu, krama_adat, business, everyone

**Do I need a helmet and an international driving permit to ride a scooter?** — pgvector order equals exact cosine: ✅

1. `0.860` PILOT-TE-002#1 — traffic_etiquette · GENERAL_ADVISORY/UNVERIFIED · applies to everyone, foreign_tourist
2. `0.850` PILOT-TE-001#1 — traffic_etiquette · GENERAL_ADVISORY/UNVERIFIED · applies to everyone, foreign_tourist
3. `0.818` PILOT-TE-003#1 — traffic_etiquette · GENERAL_ADVISORY/UNVERIFIED · applies to everyone, foreign_tourist
4. `0.813` PILOT-PB-003#1 — public_behavior · GENERAL_ADVISORY/UNVERIFIED · applies to everyone, foreign_tourist
5. `0.801` PILOT-TE-004#2 — traffic_etiquette · GENERAL_ADVISORY/UNVERIFIED · applies to everyone

**Apa yang tidak boleh dilakukan saat Nyepi di Canggu?** — pgvector order equals exact cosine: ✅

1. `0.879` CANGGU-AWIG-2012-ID::Pasal-62#1 — religious_etiquette · OFFICIAL/UNDER_REVIEW · applies to krama_adat
2. `0.859` CANGGU-AWIG-2012-ID::Pasal-56#1 — religious_etiquette · OFFICIAL/UNDER_REVIEW · applies to krama_adat
3. `0.857` CANGGU-AWIG-2012-ID::Pasal-55#1 — religious_etiquette · OFFICIAL/UNDER_REVIEW · applies to krama_adat
4. `0.851` CANGGU-AWIG-2012-ID::Pasal-54#1 — religious_etiquette · OFFICIAL/UNDER_REVIEW · applies to krama_adat
5. `0.850` CANGGU-AWIG-2012-ID::Pasal-32#1 — sacred_places · OFFICIAL/UNDER_REVIEW · applies to krama_adat

## Ingest runs

- #1 local:Xenova/multilingual-e5-small, 120 chunks, 2026-11-05T04:57:48.230Z
