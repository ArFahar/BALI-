import { config } from '../config.js';

export interface Embedder {
  readonly id: string;
  readonly dim: number;
  embedQuery(text: string): Promise<number[]>;
  embedPassages(texts: string[]): Promise<number[][]>;
}

/**
 * Local multilingual embeddings via transformers.js (ONNX, runs on CPU).
 * Default model: multilingual-e5-small (384-d, supports Indonesian and English).
 * e5 models expect "query: " / "passage: " prefixes.
 */
export class LocalEmbedder implements Embedder {
  readonly dim = 384;
  private extractor: Promise<(input: string[], opts: object) => Promise<{ tolist(): number[][] }>> | null = null;

  constructor(private readonly model = config.localEmbeddingModel) {}

  get id() {
    return `local:${this.model}`;
  }

  private load() {
    if (!this.extractor) {
      this.extractor = import('@huggingface/transformers').then(async ({ pipeline, env }) => {
        env.cacheDir = `${config.cacheDir}/models`;
        const pipe = await pipeline('feature-extraction', this.model, { dtype: 'q8' });
        return pipe as unknown as (input: string[], opts: object) => Promise<{ tolist(): number[][] }>;
      });
    }
    return this.extractor;
  }

  private async run(texts: string[]): Promise<number[][]> {
    const extractor = await this.load();
    const out = await extractor(texts, { pooling: 'mean', normalize: true });
    return out.tolist();
  }

  async embedQuery(text: string) {
    const [v] = await this.run([`query: ${text}`]);
    return v;
  }

  async embedPassages(texts: string[]) {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 8) {
      out.push(...(await this.run(texts.slice(i, i + 8).map((t) => `passage: ${t}`))));
    }
    return out;
  }
}

/** Gemini embeddings (requires GEMINI_API_KEY). Normalised so cosine == dot product. */
export class GeminiEmbedder implements Embedder {
  constructor(
    private readonly apiKey: string,
    private readonly model = config.geminiEmbeddingModel,
    readonly dim = config.embeddingDim,
  ) {}

  get id() {
    return `gemini:${this.model}:${this.dim}`;
  }

  private async embed(text: string, taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({ content: { parts: [{ text }] }, taskType, outputDimensionality: this.dim }),
    });
    if (!res.ok) throw new Error(`Gemini embedding failed with HTTP ${res.status}`);
    const json = (await res.json()) as { embedding: { values: number[] } };
    return normalize(json.embedding.values);
  }

  embedQuery(text: string) {
    return this.embed(text, 'RETRIEVAL_QUERY');
  }

  async embedPassages(texts: string[]) {
    const out: number[][] = [];
    for (const t of texts) out.push(await this.embed(t, 'RETRIEVAL_DOCUMENT'));
    return out;
  }
}

export function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function createEmbedder(): Embedder {
  if (config.embeddingProvider === 'gemini') {
    if (!config.geminiApiKey) throw new Error('EMBEDDING_PROVIDER=gemini requires GEMINI_API_KEY');
    return new GeminiEmbedder(config.geminiApiKey);
  }
  return new LocalEmbedder();
}
