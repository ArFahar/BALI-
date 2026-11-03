import path from 'node:path';
import { REPO_ROOT } from '../src/config.js';
import { loadKnowledgeFile } from '../src/rag/knowledge.js';
import type { Embedder } from '../src/rag/embeddings.js';
import { normalize } from '../src/rag/embeddings.js';
import { MemoryVectorStore } from '../src/rag/vectorStore.js';
import { RagPipeline } from '../src/rag/pipeline.js';
import type { LlmClient } from '../src/rag/llm.js';

export const knowledgePath = path.join(REPO_ROOT, 'knowledge', 'scenarios.json');

/**
 * Deterministic bag-of-words embedder for fast unit tests (no model download).
 * It is NOT semantic; real retrieval quality is measured by `npm run eval` with the multilingual model.
 */
export class HashEmbedder implements Embedder {
  readonly id = 'test:hash';
  readonly dim = 256;
  private vec(text: string) {
    const v = new Array(this.dim).fill(0);
    for (const w of text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 2)) {
      let h = 0;
      for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      v[h % this.dim] += 1;
    }
    return normalize(v);
  }
  async embedQuery(t: string) {
    return this.vec(t);
  }
  async embedPassages(ts: string[]) {
    return ts.map((t) => this.vec(t));
  }
}

export async function makePipeline(opts: { llm?: LlmClient | null; minScore?: number } = {}) {
  const embedder = new HashEmbedder();
  const store = await MemoryVectorStore.build(loadKnowledgeFile(knowledgePath), embedder);
  const pipeline = new RagPipeline({
    store,
    embedder,
    llm: opts.llm ?? null,
    topK: 4,
    minScore: opts.minScore ?? 0.15,
    strongScore: 0.3,
    standaloneScore: 0.5,
  });
  return { pipeline, store, embedder };
}
