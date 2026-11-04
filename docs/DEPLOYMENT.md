# Deployment

**Production:** https://localnorm.vercel.app (Vercel project `localnorm`, team `planeflys-projects`). Frontend, public API and SumoPod LLM generation were verified on 4 November 2026. The Docker topology below is an alternative and remains untested.

## Current Vercel setup

- Deploy from the repository root with `vercel --prod --yes --scope planeflys-projects`. Root `vercel.json` sets the static output to `web/dist` and routes `/api/*` to `api/index.mjs`.
- Node.js 22; `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci` avoids unused GPU libraries. `npm run build:vercel` builds both workspaces and warms the model and vector cache during the build.
- The function bundles `knowledge/`, `server/dist/`, the local model/cache and Linux x64 ONNX binaries. Unused platform binaries and WebAssembly binaries are excluded. Runtime inference uses the bundled model without a remote model download.
- Set `LLM_PROVIDER=sumopod`, `SUMOPOD_MODEL=deepseek-v4-flash`, `SUMOPOD_BASE_URL=https://ai.sumopod.com/v1`, `LLM_TIMEOUT_MS=40000`, `EMBEDDING_PROVIDER=local`, `VECTOR_STORE=memory`, and `CORS_ORIGIN=https://localnorm.vercel.app` in production. `SUMOPOD_API_KEY` is a sensitive Vercel environment variable; never pass it through a `VITE_` variable.
- The browser calls same-origin `/api`; leave `VITE_API_BASE_URL` unset. No separate backend host is needed for this setup.
- Conversation state and rate limits are per function instance. Feedback uses writable `/tmp/localnorm-data` and is temporary; configure managed Postgres for durable feedback and a shared vector store.
- Verification: local build/ingest passed, 62 tests passed, the adapter loaded the bundled model with remote loading disabled, public health reported 26 chunks and `sumopod:deepseek-v4-flash`, and a live Indonesian question returned `generation_mode: llm` with source `ln-010`. The browser also displayed a sourced LLM answer about a ceremony blocking a road.

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
| `LLM_TIMEOUT_MS` | `40000` for SumoPod, below the frontend's 45-second timeout |
| `GEMINI_API_KEY` | optional alternative when `LLM_PROVIDER=gemini` |
| `DATABASE_URL` + `VECTOR_STORE=pgvector` | optional; the container runs `migrate` + `ingest` on start |
| `PORT` | set by most hosts automatically |

The Dockerfile warms the embedding model at build time to avoid a ~120 MB download on cold start. **The image build has not been run in this session.**

## 2. Database (optional)

1. Create a Postgres 15+ database with the `vector` extension available (Neon and Supabase include it).
2. `DATABASE_URL=... npm run migrate` then `DATABASE_URL=... npm run ingest`.
3. Re-run `npm run ingest` after every knowledge-base change (idempotent; only changed rows are re-embedded; removed scenarios are deleted).

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
