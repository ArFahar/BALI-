/**
 * Stage 3 - Chunking.
 *
 *   node knowledge/pipeline/stage3_chunk.mjs
 *
 * Input : knowledge/processing/stage2_structured/knowledge_units.jsonl
 * Output: knowledge/processing/stage3_chunks/chunks.jsonl, knowledge/processing/STAGE3_REPORT.md
 *
 * Token counts use the real tokenizer of the embedding model (Xenova/multilingual-e5-small, loaded from the
 * local cache). That model reads at most 512 tokens, so a chunk (context header + body) is capped at 480.
 *
 * Rules
 *  - Never cut inside a sentence: segments are lines (ayat/huruf), then sentences, then clauses.
 *  - Every chunk starts with a header naming the document, article and chapter, so it stands on its own.
 *  - A long article is split into several chunks; consecutive chunks share ~50-80 tokens of whole sentences.
 *  - Short consecutive articles are merged when they share document, chapter, category and applicability.
 *  - Page numbers and source references travel with every chunk.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoTokenizer, env } from '@huggingface/transformers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROC = path.join(ROOT, 'knowledge', 'processing');
const OUT = path.join(PROC, 'stage3_chunks');

export const MODEL = 'Xenova/multilingual-e5-small';
export const MAX_TOTAL = 480; // model limit 512 minus room for the "passage: " prefix and special tokens
const TARGET_MIN = 300;
const OVERLAP_MIN = 50;
const OVERLAP_MAX = 80;

env.allowRemoteModels = false;
env.localModelPath = path.join(ROOT, 'server', '.cache', 'models');
const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const tok = (s) => tokenizer.encode(s).length;

const units = fs
  .readFileSync(path.join(PROC, 'stage2_structured', 'knowledge_units.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const SHORT_TITLE = {
  'CANGGU-AWIG-2012-ID': 'Awig-Awig Desa Adat Canggu 2012 (terjemahan tidak resmi)',
  'CANGGU-PARAREM-03-2025': 'Pararem Desa Adat Canggu No. 3 Tahun 2025 tentang Pengelolaan Sampah',
};

function shortTitle(u) {
  if (SHORT_TITLE[u.document_id]) return SHORT_TITLE[u.document_id];
  const t = u.title.replace(/\s+/g, ' ');
  // "PERATURAN GUBERNUR BALI NOMOR 97 TAHUN 2018 TENTANG ..." -> title case, keep it reasonably short
  const tc = t.length > 40 && t === t.toUpperCase() ? t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : t;
  return tc.length > 140 ? `${tc.slice(0, 137)}...` : tc;
}

function header(group) {
  const u = group[0];
  const articles = group.map((g) => g.article).filter(Boolean);
  const art = articles.length > 1 ? `${articles[0]}–${articles.at(-1).replace('Pasal ', '')}` : articles[0];
  const chap = u.chapter ? ` · ${u.chapter.replace(/\s+/g, ' ').slice(0, 90)}` : '';
  return `${shortTitle(u)}${art ? ` — ${art}` : ''}${chap}`;
}

/** Split text into whole-sentence segments no longer than `limit` tokens. */
function segments(text, limit) {
  const out = [];
  const pushPiece = (piece) => {
    piece = piece.trim();
    if (!piece) return;
    if (tok(piece) <= limit) return out.push({ text: piece, hard: false });
    const sentences = piece.split(/(?<=[.;:])\s+(?=[A-Z(0-9•-]|[a-z]\.\s)/);
    if (sentences.length > 1) return sentences.forEach(pushPiece);
    const clauses = piece.split(/(?<=,)\s+/);
    if (clauses.length > 1) return clauses.forEach(pushPiece);
    // Last resort: a single run-on clause longer than the limit (rare). Split by words and flag it.
    const words = piece.split(/\s+/);
    let cur = [];
    for (const w of words) {
      if (cur.length && tok([...cur, w].join(' ')) > limit) {
        out.push({ text: cur.join(' '), hard: true });
        cur = [];
      }
      cur.push(w);
    }
    if (cur.length) out.push({ text: cur.join(' '), hard: true });
  };
  for (const line of text.split('\n')) pushPiece(line);
  // A markdown heading ("## Do") must never end a chunk on its own: glue it to the segment that follows.
  for (let i = out.length - 2; i >= 0; i--) {
    if (/^#{1,6}\s/.test(out[i].text)) {
      out[i] = { text: `${out[i].text}\n${out[i + 1].text}`, hard: out[i + 1].hard };
      out.splice(i + 1, 1);
    }
  }
  return out.map((s) => ({ ...s, tokens: tok(s.text) }));
}

const key = (u) => [u.document_id, u.chapter ?? '', u.category, [...u.applicable_to].sort().join(',')].join('|');

// 1. Merge short consecutive units that share document, chapter, category and applicability.
const groups = [];
for (const u of units) {
  const prev = groups.at(-1);
  const bodyTokens = tok(u.content);
  if (prev && key(prev[0]) === key(u) && prev.tokens < TARGET_MIN && prev.tokens + bodyTokens + tok(header([...prev, u])) <= MAX_TOTAL) {
    prev.push(u);
    prev.tokens += bodyTokens;
  } else {
    const g = [u];
    g.tokens = bodyTokens;
    groups.push(g);
  }
}

// 2. Pack each group into chunks with sentence-level overlap.
const chunks = [];
const stats = { merged_groups: 0, split_units: 0, hard_split_segments: 0, overlaps: [] };
for (const g of groups) {
  if (g.length > 1) stats.merged_groups++;
  const head = header(g);
  // Tokenising "header\nbody" can cost a few tokens more than the parts counted separately;
  // shrink the body budget until every chunk of this group fits under MAX_TOTAL.
  let slack = 0;
  let packed;
  for (;;) {
    packed = pack(g, head, MAX_TOTAL - tok(head) - 1 - slack);
    const worst = Math.max(...packed.map((part) => tok(`${head}\n${part.map((p) => p.text).join('\n')}`)));
    if (worst <= MAX_TOTAL) break;
    slack += worst - MAX_TOTAL + 2;
  }
  emit(g, head, packed);
}

function pack(g, head, limit) {
  const segs = g.flatMap((u) => segments(u.content, limit).map((s) => ({ ...s, unit: u })));
  const packed = [];
  let cur = [];
  let curTok = 0;
  for (const s of segs) {
    if (cur.length && curTok + s.tokens > limit) {
      packed.push(cur);
      // Overlap: carry trailing whole segments (50-80 tokens) into the next chunk.
      const carry = [];
      let carryTok = 0;
      for (let i = cur.length - 1; i >= 0 && carryTok + cur[i].tokens <= OVERLAP_MAX; i--) {
        carry.unshift(cur[i]);
        carryTok += cur[i].tokens;
      }
      cur = carryTok >= OVERLAP_MIN || carry.length ? carry.map((c) => ({ ...c, overlap: true })) : [];
      curTok = cur.reduce((a, c) => a + c.tokens, 0);
    }
    cur.push({ ...s, overlap: false });
    curTok += s.tokens;
  }
  if (cur.length) packed.push(cur);
  return packed;
}

function emit(g, head, packed) {
  stats.hard_split_segments += packed.flat().filter((s) => s.hard && !s.overlap).length;
  if (packed.length > 1) stats.split_units++;

  packed.forEach((part, i) => {
    const unitsIn = [...new Map(part.map((p) => [p.unit.unit_id, p.unit])).values()];
    const u0 = unitsIn[0];
    const body = part.map((p) => p.text).join('\n');
    const text = `${head}\n${body}`;
    const overlapTokens = part.filter((p) => p.overlap).reduce((a, p) => a + p.tokens, 0);
    if (i > 0) stats.overlaps.push(overlapTokens);
    const pages = [...new Set(unitsIn.flatMap((x) => [x.page_number, x.page_number_end]).filter((x) => x != null))].sort((a, b) => a - b);
    chunks.push({
      chunk_id: `${u0.unit_id}${g.length > 1 ? `+${g.length - 1}` : ''}#${i + 1}`,
      document_id: u0.document_id,
      unit_ids: unitsIn.map((x) => x.unit_id),
      title: u0.title,
      context_header: head,
      articles: unitsIn.map((x) => x.article).filter(Boolean),
      chapter: u0.chapter,
      part: `${i + 1}/${packed.length}`,
      content: text,
      token_count: tok(text),
      overlap_tokens: overlapTokens,
      hard_split: part.some((p) => p.hard),
      category: u0.category,
      category_label: u0.category_label,
      location_scope: u0.location_scope,
      source_type: u0.source_type,
      applicable_to: u0.applicable_to,
      validation_status: u0.validation_status,
      source_url: u0.source_url,
      effective_date: u0.effective_date,
      page_number: pages[0] ?? null,
      page_numbers: pages,
      page_ref_type: u0.page_ref_type,
      language: u0.language,
      flags: u0.flags,
    });
  });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'chunks.jsonl'), chunks.map((c) => JSON.stringify(c)).join('\n') + '\n');

// ---------------------------------------------------------------- report
const toks = chunks.map((c) => c.token_count).sort((a, b) => a - b);
const q = (p) => toks[Math.min(toks.length - 1, Math.floor(p * toks.length))];
const byCat = {};
for (const c of chunks) byCat[c.category_label] = (byCat[c.category_label] ?? 0) + 1;
const byLang = {};
for (const c of chunks) byLang[c.language] = (byLang[c.language] ?? 0) + 1;
const bands = { '< 100': 0, '100-299': 0, '300-450': 0, '451-480': 0, '> 480': 0 };
for (const t of toks) bands[t < 100 ? '< 100' : t < 300 ? '100-299' : t <= 450 ? '300-450' : t <= 480 ? '451-480' : '> 480']++;
const ov = stats.overlaps;
const sample = (id) => chunks.find((c) => c.chunk_id.startsWith(id));

const md = [
  '# Stage 3 report - chunking (generated)',
  '',
  `Generated by \`knowledge/pipeline/stage3_chunk.mjs\`. Tokenizer: \`${MODEL}\` (local). Cap: ${MAX_TOTAL} tokens per chunk incl. header (model limit 512).`,
  '',
  '## Summary',
  '',
  '| metric | value |',
  '|---|---|',
  `| knowledge units in | ${units.length} |`,
  `| chunks out | ${chunks.length} |`,
  `| units merged into a shared chunk (groups) | ${stats.merged_groups} |`,
  `| units split into several chunks | ${stats.split_units} |`,
  `| tokens per chunk min / median / p90 / max | ${toks[0]} / ${q(0.5)} / ${q(0.9)} / ${toks.at(-1)} |`,
  `| overlap tokens between split parts (min / median / max) | ${ov.length ? `${Math.min(...ov)} / ${ov.sort((a, b) => a - b)[Math.floor(ov.length / 2)]} / ${Math.max(...ov)}` : '—'} |`,
  `| chunks containing a word-level hard split | ${chunks.filter((c) => c.hard_split).length} |`,
  `| chunks over the ${MAX_TOTAL}-token cap | ${chunks.filter((c) => c.token_count > MAX_TOTAL).length} |`,
  '',
  '## Token distribution',
  '',
  '| tokens | chunks |',
  '|---|---|',
  ...Object.entries(bands).map(([k, v]) => `| ${k} | ${v} |`),
  '',
  'Chunks under 300 tokens are articles that are short on their own and could not be merged without mixing',
  'documents, chapters, categories or applicability. They are kept whole rather than padded with unrelated text.',
  '',
  '## Chunks per category / language',
  '',
  '| category | chunks |',
  '|---|---|',
  ...Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`),
  '',
  `Languages: ${Object.entries(byLang).map(([k, v]) => `${k} = ${v}`).join(', ')} (retrieval must be cross-lingual).`,
  '',
  '## Sample chunks',
  '',
  ...['CANGGU-AWIG-2012-ID::Pasal-4', 'CANGGU-PARAREM-03-2025::Pasal-6', 'PILOT-TE-002']
    .map(sample)
    .filter(Boolean)
    .flatMap((c) => [
      `### ${c.chunk_id} (${c.token_count} tokens, page ${c.page_number ?? '—'}, ${c.category}, applies to ${c.applicable_to.join(', ')})`,
      '',
      '```text',
      c.content.length > 1400 ? `${c.content.slice(0, 1400)}\n[...]` : c.content,
      '```',
      '',
    ]),
];
fs.writeFileSync(path.join(PROC, 'STAGE3_REPORT.md'), md.join('\n'));
console.log(`${units.length} units -> ${chunks.length} chunks; tokens median ${q(0.5)}, max ${toks.at(-1)}`);
