import path from 'node:path';
import { config } from './config.js';
import { getPool } from './db/pool.js';
import { FileFeedbackStore, PgFeedbackStore, type FeedbackStore } from './feedback.js';
import { createEmbedder } from './rag/embeddings.js';
import { loadKnowledgeFile } from './rag/knowledge.js';
import { createLlm } from './rag/llm.js';
import { PgVectorStore } from './rag/pgVectorStore.js';
import { RagPipeline } from './rag/pipeline.js';
import { MemoryVectorStore, type VectorStore } from './rag/vectorStore.js';

/** Wire up the real dependencies from environment configuration. */
export async function bootstrap() {
  const embedder = createEmbedder();
  const llm = createLlm();

  let store: VectorStore;
  let feedback: FeedbackStore;
  if (config.vectorStore === 'pgvector') {
    const pool = getPool();
    store = new PgVectorStore(pool);
    feedback = new PgFeedbackStore(pool);
    const n = await store.count();
    if (n === 0) console.warn('[bootstrap] knowledge_documents is empty — run `npm run migrate && npm run ingest`.');
  } else {
    store = await MemoryVectorStore.build(loadKnowledgeFile(config.knowledgePath), embedder, config.cacheDir);
    feedback = new FileFeedbackStore(path.join(config.dataDir, 'feedback.jsonl'));
  }

  const pipeline = new RagPipeline({
    store,
    embedder,
    llm,
    topK: config.retrievalTopK,
    minScore: config.retrievalMinScore,
    strongScore: config.retrievalStrongScore,
    standaloneScore: config.retrievalStandaloneScore,
    logger: console,
  });

  return { pipeline, store, feedback, embedder, llm };
}
