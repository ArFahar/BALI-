import path from 'node:path';
import { config } from './config.js';
import { getPool } from './db/pool.js';
import { FileFeedbackStore, PgFeedbackStore, type FeedbackStore } from './feedback.js';
import { FileKbStore, PgKbStore, type KbStore } from './kb/store.js';
import { createEmbedder } from './rag/embeddings.js';
import { SumoPodClient, createLlm } from './rag/llm.js';
import { RagPipeline } from './rag/pipeline.js';
import { GlossaryTranslator, LlmQueryTranslator, LocalQueryTranslator, type QueryTranslator } from './rag/translator.js';

/** Wire up the real dependencies from environment configuration. */
export async function bootstrap() {
  const embedder = createEmbedder();
  const llm = createLlm();
  const translator = createTranslator();

  let store: KbStore;
  let feedback: FeedbackStore;
  if (config.kbSource === 'pgvector') {
    const pool = getPool();
    store = new PgKbStore(pool);
    feedback = new PgFeedbackStore(pool);
    if ((await store.count()) === 0) {
      console.warn('[bootstrap] knowledge_chunks is empty - run `npm run migrate` and `npm run kb:load`.');
    }
  } else {
    store = FileKbStore.load(config.processingDir);
    feedback = new FileFeedbackStore(path.join(config.dataDir, 'feedback.jsonl'));
  }

  // Indexed vectors and query vectors must come from the same model.
  const indexed = await store.embeddingModel();
  if (indexed && indexed !== embedder.id) {
    throw new Error(`Knowledge base was embedded with ${indexed} but the server is configured for ${embedder.id}`);
  }

  const pipeline = new RagPipeline({
    store,
    embedder,
    translator,
    llm,
    topK: config.retrievalTopK,
    minScore: config.retrievalMinScore,
    strongScore: config.retrievalStrongScore,
    standaloneScore: config.retrievalStandaloneScore,
    logger: console,
  });

  return { pipeline, store, feedback, embedder, llm, translator };
}

function createTranslator(): QueryTranslator | null {
  switch (config.queryTranslator) {
    case 'local':
      return new LocalQueryTranslator();
    case 'glossary':
      return new GlossaryTranslator();
    case 'llm':
      if (config.sumopodApiKey) {
        // Separate client with a short timeout: a slow translation must not consume the answer's time budget.
        return new LlmQueryTranslator(new SumoPodClient(config.sumopodApiKey, config.sumopodModel, config.translateTimeoutMs));
      }
      console.warn('[bootstrap] QUERY_TRANSLATOR=llm needs SUMOPOD_API_KEY; using glossary terms only.');
      return new GlossaryTranslator();
    default:
      return null;
  }
}
