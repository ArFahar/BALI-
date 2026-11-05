# Knowledge pipeline

Turns the source files in `Database/` into the knowledge base the API searches. Full description and gate
decisions: [docs/KNOWLEDGE_BASE_V2.md](../../docs/KNOWLEDGE_BASE_V2.md).

| Stage | Script | Output (`knowledge/processing/`) | Report |
|---|---|---|---|
| 0 (scanned PDFs) | `ocr_windows.ps1 -Pdf in.pdf -Out out.txt` | `_raw/ocr/` | — |
| 1 Extract & clean | `python -I stage1_extract.py` | `stage1_extracted/*.md`, `source_inventory.json` | `STAGE1_REPORT.md` |
| 2 Structure + metadata | `python -I stage2_structure.py` | `stage2_structured/` | `STAGE2_REPORT.md` |
| 3 Chunk | `node stage3_chunk.mjs` | `stage3_chunks/chunks.jsonl` | `STAGE3_REPORT.md` |
| 4 Embed | `node stage4_embed.mjs` | `stage4_embeddings/` | `STAGE4_REPORT.md` |
| 5 Load pgvector | `DATABASE_URL=… node stage5_load.mjs` | DB rows | `STAGE5_REPORT.md` |

Run from the repository root, or use `npm run kb:build` (1–4) and `npm run kb:load` (5).

Requirements: Python 3.10+ with `pypdf`; poppler `pdftotext`; Node 20+ with the workspace installed (the e5 model
is read from `server/.cache/models`, downloaded on first server run). OCR uses the engine built into Windows 10/11.

Source PDFs and `_raw/` are not committed (see `.gitignore`); `source_inventory.json` records each file's URL and
SHA-256 so the inputs can be re-downloaded and checked.
