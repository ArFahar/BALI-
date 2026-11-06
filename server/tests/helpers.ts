import type { Embedder } from '../src/rag/embeddings.js';
import { normalize } from '../src/rag/embeddings.js';
import type { KbStore } from '../src/kb/store.js';
import { RagPipeline } from '../src/rag/pipeline.js';
import type { LlmClient } from '../src/rag/llm.js';
import { GlossaryTranslator, type QueryTranslator } from '../src/rag/translator.js';
import type { KbChunk, RetrievalFilter } from '../src/types.js';

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

const base = {
  publisher: null,
  chapter: null,
  validation_status: 'UNDER_REVIEW' as const,
  effective_date: null,
  page_numbers: [],
  page_ref_type: 'pdf_page',
};

/** Real excerpts from the v2 knowledge base, trimmed. */
export const FIXTURE_CHUNKS: KbChunk[] = [
  {
    ...base,
    chunk_key: 'CANGGU-PARAREM-03-2025::Pasal-6#1',
    document_key: 'CANGGU-PARAREM-03-2025',
    document_title: 'Pararem Desa Adat Canggu Nomor 3 Tahun 2025 tentang Pengelolaan Sampah',
    context_header: 'Pararem Desa Adat Canggu No. 3 Tahun 2025 tentang Pengelolaan Sampah — Pasal 6',
    articles: ['Pasal 6'],
    content:
      'Pararem Desa Adat Canggu No. 3 Tahun 2025 tentang Pengelolaan Sampah — Pasal 6\nPasal 6 Pengelolaan Sampah Rumah Tangga\n(1) Setiap Krama Adat, Krama Tamiu, dan Tamiu dalam rumah tangga wajib melakukan pengelolaan sampah yang dihasilkannya.\n(2) Pengelolaan sampah rumah tangga dilakukan dengan cara: c. menyediakan 5 (lima) jenis tempat penyimpanan sampah; d. melakukan pemilahan dan pewadahan sampah berdasarkan jenisnya.',
    category: 'environmental_etiquette',
    location_scope: 'canggu',
    applicable_to: ['tamiu', 'krama_tamiu', 'krama_adat', 'everyone'],
    source_type: 'OFFICIAL',
    source_subtype: 'customary_law',
    source_url: 'https://jidhat.baliprov.go.id/storage/perarem/Psw73vxwlisjkXj1gfvz9zalLC3tvCWgE1huf5t2.pdf',
    page_number: 11,
    language: 'id',
    flags: [],
  },
  {
    ...base,
    chunk_key: 'CANGGU-AWIG-2012-ID::Pasal-4#1',
    document_key: 'CANGGU-AWIG-2012-ID',
    document_title: 'Awig-Awig Desa Adat Canggu (naskah 2012)',
    context_header: 'Awig-Awig Desa Adat Canggu 2012 (terjemahan tidak resmi) — Pasal 4',
    articles: ['Pasal 4'],
    content:
      'Awig-Awig Desa Adat Canggu 2012 (terjemahan tidak resmi) — Pasal 4\nPasal 4 (2) Di luar itu disebut tamiu. b. Mencari penghidupan dan bertempat tinggal sampai sebulan, wajib: • Dalam satu wuku (tujuh hari), melapor kepada prajuru adat dan dinas dengan dokumen yang jelas. • Membayar sadana krama menurut ketentuan masing-masing banjar.',
    category: 'neighborhood_etiquette',
    location_scope: 'canggu',
    applicable_to: ['tamiu', 'krama_adat'],
    source_type: 'OFFICIAL',
    source_subtype: 'customary_law',
    source_url: null,
    page_number: 18,
    page_ref_type: 'original_scan_page',
    language: 'id',
    flags: ['UNOFFICIAL_TRANSLATION', 'EDITION_2012_VALIDITY_UNCONFIRMED', 'SOURCE_URL_UNKNOWN'],
  },
  {
    ...base,
    chunk_key: 'CANGGU-AWIG-2012-ID::Pasal-62#1',
    document_key: 'CANGGU-AWIG-2012-ID',
    document_title: 'Awig-Awig Desa Adat Canggu (naskah 2012)',
    context_header: 'Awig-Awig Desa Adat Canggu 2012 (terjemahan tidak resmi) — Pasal 62',
    articles: ['Pasal 62'],
    content:
      'Awig-Awig Desa Adat Canggu 2012 (terjemahan tidak resmi) — Pasal 62\nPasal 62 (1) Pelaksanaan Hari Nyepi mengikuti catur brata: 1. Amati geni: tidak boleh menyalakan api, kecuali: a. Bagi yang mempunyai bayi. 2. Amati karya: tidak boleh bekerja. 3. Amati lampah: tidak boleh bepergian.',
    category: 'religious_etiquette',
    location_scope: 'canggu',
    applicable_to: ['krama_adat'],
    source_type: 'OFFICIAL',
    source_subtype: 'customary_law',
    source_url: null,
    page_number: 86,
    page_ref_type: 'original_scan_page',
    language: 'id',
    flags: ['UNOFFICIAL_TRANSLATION', 'EDITION_2012_VALIDITY_UNCONFIRMED', 'SOURCE_URL_UNKNOWN'],
  },
  {
    ...base,
    chunk_key: 'PILOT-TE-002#1',
    document_key: 'PILOT-TE-002',
    document_title: 'Basic Road Safety and Traffic Compliance',
    context_header: 'Basic Road Safety and Traffic Compliance',
    articles: [],
    content:
      'Basic Road Safety and Traffic Compliance\n# Basic Road Safety and Traffic Compliance\n## Definition\nRoad users must obey signs and directions, use required safety equipment such as a motorcycle helmet, and respect passenger limits.\n## Significance\nRoad safety protects drivers, passengers and pedestrians.\n## Do\n- Wear a properly fastened motorcycle helmet\n- Follow signs\n## Don\'t\n- Ride without a helmet',
    category: 'traffic_etiquette',
    location_scope: 'bali',
    applicable_to: ['everyone', 'foreign_tourist'],
    source_type: 'GENERAL_ADVISORY',
    source_subtype: 'research_summary',
    source_url: 'https://sita.badungkab.go.id/berita/panduan-wajib-wisatawan-asing-di-bali-dos-donts',
    validation_status: 'UNVERIFIED',
    page_number: null,
    page_ref_type: null,
    language: 'en',
    flags: ['PRIMARY_URL_UNREACHABLE', 'SUMMARY_OF_FOREIGN_TOURIST_CIRCULAR'],
  },
  {
    ...base,
    chunk_key: 'PILOT-PB-004#1',
    document_key: 'PILOT-PB-004',
    document_title: 'Nightlife and Neighborhood Etiquette in Canggu',
    context_header: 'Nightlife and Neighborhood Etiquette in Canggu',
    articles: [],
    content:
      'Nightlife and Neighborhood Etiquette in Canggu\n# Nightlife and Neighborhood Etiquette in Canggu\n## Definition\nGuidance for enjoying bars, clubs and evening events while respecting nearby residents. Outdoor music noise volume was agreed in 2022 to be limited to 70 dB.\n## Do\n- Keep music and noise low at night',
    category: 'public_behavior',
    location_scope: 'canggu',
    applicable_to: ['everyone'],
    source_type: 'GENERAL_ADVISORY',
    source_subtype: 'research_summary',
    source_url: 'https://dispar.badungkab.go.id/berita/44559',
    validation_status: 'UNVERIFIED',
    page_number: null,
    page_ref_type: null,
    language: 'en',
    flags: ['LOCAL_REVIEW_REQUIRED', 'HISTORICAL_2022_AGREEMENT'],
  },
  {
    ...base,
    chunk_key: 'JIDHAT-03::Pasal-7#1',
    document_key: 'JIDHAT-03',
    document_title: 'Peraturan Gubernur Bali Nomor 97 Tahun 2018 tentang Pembatasan Timbulan Sampah Plastik Sekali Pakai',
    context_header: 'Peraturan Gubernur Bali Nomor 97 Tahun 2018 — Pasal 7',
    articles: ['Pasal 7'],
    content:
      'Peraturan Gubernur Bali Nomor 97 Tahun 2018 — Pasal 7\nPasal 7 Setiap orang dilarang menggunakan plastik sekali pakai berupa kantong plastik, polysterina, dan sedotan plastik.',
    category: 'environmental_etiquette',
    location_scope: 'bali',
    applicable_to: ['everyone'],
    source_type: 'OFFICIAL',
    source_subtype: 'government_regulation',
    source_url: 'https://jidhat.baliprov.go.id/storage/produk_hukum/vnOZDjIJI2tWULUjDxeMLAl0xUSTF3ExFH5O24my.pdf',
    page_number: 5,
    language: 'id',
    flags: [],
  },
];

/** In-memory KbStore over the fixture chunks, embedded with the given (test) embedder. */
export async function fixtureStore(embedder: Embedder, chunks = FIXTURE_CHUNKS): Promise<KbStore> {
  const vectors = await embedder.embedPassages(chunks.map((c) => c.content));
  const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
  return {
    kind: 'files',
    count: async () => chunks.length,
    search: async (q: number[], f: RetrievalFilter, k: number) =>
      chunks
        .map((chunk, i) => ({ chunk, score: dot(q, vectors[i]) }))
        .filter((r) => f.scopes.includes(r.chunk.location_scope) && !f.excludeStatuses.includes(r.chunk.validation_status))
        .sort((a, b) => b.score - a.score)
        .slice(0, k),
    categories: async () => [{ category: 'environmental_etiquette', chunks: 2, documents: 2 }],
    embeddingModel: async () => embedder.id,
    ping: async () => true,
  };
}

export async function makePipeline(
  opts: { llm?: LlmClient | null; minScore?: number; translator?: QueryTranslator | null } = {},
) {
  const embedder = new HashEmbedder();
  const store = await fixtureStore(embedder);
  const pipeline = new RagPipeline({
    store,
    embedder,
    translator: opts.translator === undefined ? new GlossaryTranslator() : opts.translator,
    llm: opts.llm ?? null,
    topK: 4,
    minScore: opts.minScore ?? 0.15,
    strongScore: 0.3,
    standaloneScore: 0.6,
  });
  return { pipeline, store, embedder };
}
