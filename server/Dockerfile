# Build from the repository root:  docker build -f server/Dockerfile .
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace server --include-workspace-root
COPY server server
RUN npm run build --workspace server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace server --include-workspace-root --omit=dev
COPY --from=build /app/server/dist server/dist
COPY server/db server/db
COPY knowledge knowledge
# Warm the embedding model + cache at build time so cold starts don't download it.
RUN node -e "import('./server/dist/rag/embeddings.js').then(m=>new m.LocalEmbedder().embedQuery('warmup'))"
EXPOSE 8787
# Applies migrations and ingests the knowledge base (idempotent) when using pgvector, then starts the API.
CMD ["sh", "-c", "if [ \"$VECTOR_STORE\" = pgvector ]; then node server/dist/scripts/migrate.js && node server/dist/scripts/ingest.js; fi; node server/dist/index.js"]
