/**
 * Knowledge ingestion: validate knowledge/scenarios.json → chunk per language → embed → store.
 * With VECTOR_STORE=pgvector rows are upserted into Postgres; otherwise the on-disk embedding cache is warmed.
 */
import { config } from '../config.js';
import { closePool, getPool } from '../db/pool.js';
import { createEmbedder } from '../rag/embeddings.js';
import { loadKnowledgeFile } from '../rag/knowledge.js';
import { PgVectorStore } from '../rag/pgVectorStore.js';
import { MemoryVectorStore } from '../rag/vectorStore.js';

async function main() {
  const chunks = loadKnowledgeFile(config.knowledgePath);
  console.log(`validated ${chunks.length} chunks from ${config.knowledgePath}`);
  const byStatus = chunks.reduce<Record<string, number>>((acc, c) => {
    acc[c.validation_status] = (acc[c.validation_status] ?? 0) + 1;
    return acc;
  }, {});
  console.log('validation status:', byStatus, `| demo chunks: ${chunks.filter((c) => c.is_demo_data).length}`);

  const embedder = createEmbedder();
  console.log(`embedder: ${embedder.id}`);

  if (config.vectorStore === 'pgvector') {
    const store = new PgVectorStore(getPool());
    const result = await store.upsert(chunks, embedder);
    console.log(`pgvector upsert: ${JSON.stringify(result)}`);
    await closePool();
  } else {
    const store = await MemoryVectorStore.build(chunks, embedder, config.cacheDir);
    console.log(`memory store warmed with ${await store.count()} chunks (cache: ${config.cacheDir})`);
  }
}

main().catch(async (err) => {
  console.error('Ingestion failed:', err);
  await closePool();
  process.exit(1);
});
