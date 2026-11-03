# Deployment

**Current status: not deployed.** Everything below is documented but only the local setup was executed. No Vercel/hosting credentials were available in this session.

## Topology

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
| `GEMINI_API_KEY` | optional; enables LLM mode |
| `DATABASE_URL` + `VECTOR_STORE=pgvector` | optional; the container runs `migrate` + `ingest` on start |
| `PORT` | set by most hosts automatically |

The Dockerfile warms the embedding model at build time to avoid a ~120 MB download on cold start. **The image build has not been run in this session.**

## 2. Database (optional)

1. Create a Postgres 15+ database with the `vector` extension available (Neon and Supabase include it).
2. `DATABASE_URL=... npm run migrate` then `DATABASE_URL=... npm run ingest`.
3. Re-run `npm run ingest` after every knowledge-base change (idempotent; only changed rows are re-embedded; removed scenarios are deleted).

Local alternative: `docker compose up -d db` (pgvector/pgvector:pg16 on port 5433), then
`DATABASE_URL=postgresql://localnorm:localnorm@localhost:5433/localnorm`.

## 3. Frontend on Vercel

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
