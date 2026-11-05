# Stage 4 report - embeddings (generated)

## Model

| field | value |
|---|---|
| embedding_model | Xenova/multilingual-e5-small |
| upstream_model | intfloat/multilingual-e5-small |
| runtime | @huggingface/transformers 3.7.6 (onnxruntime, CPU) |
| dtype | q8 |
| onnx_file | onnx/model_quantized.onnx |
| onnx_sha256 | f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193 |
| dimensions | 384 |
| max_input_tokens | 512 |
| pooling | mean |
| normalized | true |
| similarity | cosine (= dot product on normalised vectors) |
| document_prefix | passage:  |
| query_prefix | query:  |
| embedding_model_id | local:Xenova/multilingual-e5-small |
| chunks | 120 |
| chunks_file_sha256 | fcbe8289c4ef9ad94857b60d7ba5e12731f4b2a888db244c242ce6ca1350253e |
| created_at | 2026-11-05T01:46:44.158Z |
| seconds | 18.823 |

## Integrity checks

| check | result |
|---|---|
| vectors written | 120 / 120 chunks |
| dimension | 384 (expected 384) ✅ |
| all values finite | ✅ |
| L2 norm min / max | 1.000000 / 1.000000 ✅ |
| near-duplicate pairs (cosine > 0.995) | 0 |
| determinism: max abs drift re-embedding 3 chunks one at a time | 0.00e+0 ✅ |
| (reference) drift if the same 3 chunks are embedded as one batch | 1.14e-2 - why indexing uses batch size 1 |
| time | 18.8 s (0.16 s/chunk) |

## Retrieval preview (raw cosine, no filters, top 3)

A sanity check that semantically related chunks are found across languages - not an accuracy measurement.
Filtering by applicability/location/validation and the relevance thresholds are applied later, in the RAG step (Stage 6).

**Can I wear a bikini when visiting a temple?** _(en)_

1. `0.845` PILOT-CULT-003#1 — sacred_places · bali · applies to everyone
2. `0.839` PILOT-PB-003#1 — public_behavior · bali · applies to everyone, foreign_tourist
3. `0.804` PILOT-PB-001#1 — public_behavior · bali · applies to everyone, foreign_tourist

**Bolehkah saya memakai bikini saat masuk pura?** _(id)_

1. `0.860` JIDHAT-10::Pasal-45#1 — sacred_places · bali · applies to everyone
2. `0.842` JIDHAT-10::Pasal-13#1 — sacred_places · bali · applies to everyone
3. `0.829` JIDHAT-10::Pasal-1#1 — customary_context · bali · applies to tamiu, krama_tamiu, krama_adat, everyone

**I am renting a house in Canggu for two months. Do I need to report to the banjar?** _(en)_

1. `0.852` PILOT-PB-004#2 — public_behavior · canggu · applies to everyone
2. `0.848` PILOT-PB-004#1 — public_behavior · canggu · applies to everyone
3. `0.840` PILOT-TE-005#1 — traffic_etiquette · canggu · applies to everyone

**How do I sort my rubbish at my villa in Canggu?** _(en)_

1. `0.847` PILOT-PB-004#1 — public_behavior · canggu · applies to everyone
2. `0.843` PILOT-PB-004#2 — public_behavior · canggu · applies to everyone
3. `0.842` PILOT-TE-004#2 — traffic_etiquette · canggu · applies to everyone

**Apa yang tidak boleh dilakukan saat Nyepi di Canggu?** _(id)_

1. `0.878` CANGGU-AWIG-2012-ID::Pasal-62#1 — religious_etiquette · canggu · applies to krama_adat
2. `0.858` CANGGU-AWIG-2012-ID::Pasal-56#1 — religious_etiquette · canggu · applies to krama_adat
3. `0.856` CANGGU-AWIG-2012-ID::Pasal-55#1 — religious_etiquette · canggu · applies to krama_adat

**Do I need a helmet and an international driving permit to ride a scooter?** _(en)_

1. `0.859` PILOT-TE-002#1 — traffic_etiquette · bali · applies to everyone, foreign_tourist
2. `0.850` PILOT-TE-001#1 — traffic_etiquette · bali · applies to everyone, foreign_tourist
3. `0.817` PILOT-TE-003#1 — traffic_etiquette · bali · applies to everyone, foreign_tourist

**Is there a time limit for loud music at beach clubs in Canggu?** _(en)_

1. `0.879` PILOT-PB-004#1 — public_behavior · canggu · applies to everyone
2. `0.875` PILOT-PB-004#2 — public_behavior · canggu · applies to everyone
3. `0.839` PILOT-TE-004#2 — traffic_etiquette · canggu · applies to everyone

**Where can I park my scooter in Canggu?** _(en)_

1. `0.881` PILOT-TE-005#1 — traffic_etiquette · canggu · applies to everyone
2. `0.869` PILOT-TE-005#2 — traffic_etiquette · canggu · applies to everyone
3. `0.862` PILOT-TE-004#2 — traffic_etiquette · canggu · applies to everyone
