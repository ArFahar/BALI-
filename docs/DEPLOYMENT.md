# Deployment

**Production:** https://localnorm.vercel.app (Vercel project `localnorm`, team `planeflys-projects`). Frontend, public API and SumoPod LLM generation were verified on 4 November 2026. The Docker topology below is an alternative and remains untested.

## Current Vercel setup

- Deploy from the repository root with `vercel --prod --yes --scope planeflys-projects`. Root `vercel.json` sets the static output to `web/dist` and routes `/api/*` to `api/index.mjs`.
- Node.js 22; `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci` avoids unused GPU libraries. `npm run build:vercel` builds both workspaces, downloads the query-embedding model and checks that the prebuilt knowledge base v2 (`knowledge/processing/`, 120 chunks) was embedded with the same model. There is no ingest step any more.
- **Knowledge base v2 on Vercel:** `KB_SOURCE` defaults to `files` (no `DATABASE_URL`), so the function reads `knowledge/processing/`. `VECTOR_STORE` is no longer used and can be removed. The OPUS-MT translation models (~200 MB) do not fit the function size limit, so `QUERY_TRANSLATOR` defaults to `llm` on Vercel when `SUMOPOD_API_KEY` is set (short call bounded by `TRANSLATE_TIMEOUT_MS`, default 5000) and to glossary terms otherwise.
- The function bundles `knowledge/`, `server/dist/`, the local model/cache and Linux x64 ONNX binaries. Unused platform binaries and WebAssembly binaries are excluded. Runtime inference uses the bundled model without a remote model download.
- Set `LLM_PROVIDER=sumopod`, `SUMOPOD_MODEL=deepseek-v4-flash`, `SUMOPOD_BASE_URL=https://ai.sumopod.com/v1`, `LLM_TIMEOUT_MS=35000`, `EMBEDDING_PROVIDER=local`, and `CORS_ORIGIN=https://localnorm.vercel.app` in production. `SUMOPOD_API_KEY` is a sensitive Vercel environment variable; never pass it through a `VITE_` variable.
- The browser calls same-origin `/api`; leave `VITE_API_BASE_URL` unset. No separate backend host is needed for this setup.
- Conversation state and rate limits are per function instance. Feedback uses writable `/tmp/localnorm-data` and is temporary; configure managed Postgres for durable feedback and a shared vector store.
- Verification of knowledge base v2 on the Vercel path (5 November 2026, local simulation only, not deployed): `npm run build:vercel` passed; `api/index.mjs` run with `VERCEL=1` and no LLM key reported 120 chunks and glossary query translation, and answered an English banjar-registration question from awig-awig Pasal 4 and an Indonesian waste question from Pararem 3/2025 Pasal 6. The live SumoPod path with v2 has not been run.
- Earlier verification (v1 knowledge base, 4 November 2026): local build/ingest passed, 62 tests passed, the adapter loaded the bundled model with remote loading disabled, public health reported 26 chunks and `sumopod:deepseek-v4-flash`, and a live Indonesian question returned `generation_mode: llm` with source `ln-010`. The browser also displayed a sourced LLM answer about a ceremony blocking a road.

## Alternative container topology

- **Frontend:** Vercel (static build of `web/`).
- **Backend:** any container host (Render, Railway, Fly.io, Google Cloud Run) using `server/Dockerfile`. Needs ≥ 1 GB RAM for the local embedding model.
- **Database (optional):** managed Postgres with pgvector (Neon, Supabase). Without it the backend runs the in-memory store, which is fine for a single instance with this small knowledge base.

## 1. Backend

```bash
# from the repository root
docker build -f server/Dockerfile -t localnorm-api .
docker run -p 8787:8787 -e CORS_ORIGIN=https://<your-app>.vercel.app localnorm-api
```

Environment (see `.env.example`):

| Variable | Production value |
|---|---|
| `CORS_ORIGIN` | your Vercel URL(s), comma-separated |
| `LLM_PROVIDER` | `sumopod` for DeepSeek, `gemini`, or `none` |
| `SUMOPOD_API_KEY` | server-only SumoPod credential; never expose through `VITE_` |
| `SUMOPOD_BASE_URL` | `https://ai.sumopod.com/v1` |
| `SUMOPOD_MODEL` | `deepseek-v4-flash` |
| `LLM_TIMEOUT_MS` | e.g. `35000`; together with `TRANSLATE_TIMEOUT_MS` keep it below the frontend's 45-second timeout |
| `GEMINI_API_KEY` | optional alternative when `LLM_PROVIDER=gemini` |
| `DATABASE_URL` + `KB_SOURCE=pgvector` | optional; the container runs `migrate` + the stage-5 loader on start (otherwise it reads `knowledge/processing/`) |
| `PORT` | set by most hosts automatically |

The Dockerfile warms the embedding model at build time to avoid a ~120 MB download on cold start. **The image build has not been run in this session.**

## 2. Database (optional)

1. Create a Postgres 15+ database with the `vector` extension available (Neon and Supabase include it).
2. `DATABASE_URL=... npm run migrate` then `DATABASE_URL=... npm run kb:load`.
3. After rebuilding the knowledge base (`npm run kb:build`), re-run `npm run kb:load` (idempotent; refuses stale vectors; removed chunks are deleted).

Local alternative: `docker compose up -d db` (pgvector/pgvector:pg16 on port 5433), then
`DATABASE_URL=postgresql://localnorm:localnorm@localhost:5433/localnorm`.

## 3. Alternative: frontend-only Vercel with an external backend

1. Import the GitHub repository in Vercel; set **Root Directory** to `web`.
2. Framework preset: Vite (also declared in `web/vercel.json`). Build `npm run build`, output `dist`.
3. Environment variable: `VITE_API_BASE_URL=https://<your-backend-host>`.
4. Deploy, then add the Vercel URL to the backend's `CORS_ORIGIN`.

## 4. Post-deploy checks

```bash
curl https://<backend>/api/health          # expect status ok, chunks 26
curl -X POST https://<backend>/api/chat -H 'content-type: application/json' \
  -d '{"message":"Do I need a helmet?","language":"en","user_type":"tourist","location":"canggu"}'
```

If `llm.configured` is true but answers show `generation_mode: "extractive"`, check the server log for `[llm] generation failed` (bad key, quota, model name).
