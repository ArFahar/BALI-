import { config } from '../config.js';
import type { Language } from '../types.js';

/**
 * Translates the user's QUESTION into the other supported language so retrieval can reach sources written in
 * that language (most legal/customary sources are Indonesian; the research packs are English).
 *
 * Output is used for retrieval only, never shown as an answer: in testing, opus-mt-id-en turned
 * "dalam satu wuku (tujuh hari)" into "in one day", which is unacceptable for presenting rules.
 */
export interface QueryTranslator {
  readonly id: string;
  translate(text: string, from: Language, to: Language): Promise<string>;
}

/** Domain terms the generic MT model misses or renders wrongly; appended to the translated query. */
const GLOSSARY_EN_ID: [RegExp, string][] = [
  [/\btemples?\b/i, 'pura'],
  [/\bshrines?\b/i, 'pelinggih pura'],
  [/\bofferings?\b|\bcanang\b/i, 'canang sari banten'],
  [/\b(rubbish|trash|garbage|waste|litter)\b/i, 'sampah'],
  // "sort" alone is ambiguous ("sorting function"); only treat it as waste sorting next to a waste word.
  [/\b(sort(ing)?|separat\w*)\b(?=.*\b(rubbish|trash|garbage|waste|recycl\w*)\b)|\b(rubbish|trash|garbage|waste)\b.*\bsort/i, 'pemilahan sampah'],
  [/\bplastic\b/i, 'plastik sekali pakai'],
  [/\bceremon(y|ies)\b|\bprocession/i, 'upacara'],
  [/\bnyepi\b|\bday of silence\b/i, 'Nyepi catur brata'],
  // Residency questions ("renting a house ... report to the banjar?") point at the tamiu provisions, but a bare
  // rent-price question must not: require a residency-duty word alongside (eval V21 vs V01/H01).
  [/\b(rent|renting|staying|stay|live|living|move|moving)\b(?=.*\b(report|register|banjar|fee|obligat\w*|must|required|need to|have to)\b)|\b(report|register|banjar)\b(?=.*\b(rent|renting|stay|staying|live|living|newcomer)\b)/i, 'tamiu bertempat tinggal'],
  [/\b(staying|stay|live|living|move|moving)\b/i, 'bertempat tinggal'],
  [/\breport\b|\bregister\b/i, 'wajib melapor prajuru'],
  [/\bneighbou?rs?\b|\bneighbou?rhood\b/i, 'banjar tetangga'],
  [/\b(noise|loud|music|party|parties)\b/i, 'kebisingan suara'],
  [/\b(beach|sea|river|spring|lake)\b/i, 'pantai laut sungai mata air'],
  [/\bsacred\b|\bholy\b/i, 'suci kesucian'],
  [/\b(fine|fines|penalt|sanction)/i, 'sanksi denda'],
  [/\bcustomary\b|\badat\b/i, 'adat awig-awig pararem'],
  [/\b(clothes|dress|wear|bikini|swimwear)\b/i, 'busana berpakaian'],
];
const GLOSSARY_ID_EN: [RegExp, string][] = [
  [/\bpura\b/i, 'temple'],
  [/\bsampah\b/i, 'rubbish waste'],
  [/\b(helm|motor|sepeda motor|sim)\b/i, 'helmet scooter licence'],
  [/\bparkir\b/i, 'parking'],
  [/\btrotoar|pejalan kaki|sepeda\b/i, 'pedestrian sidewalk cycling'],
  [/\b(berisik|bising|musik|pesta|klub)\b/i, 'noise nightlife music'],
  [/\b(pakaian|busana|bikini|baju)\b/i, 'dress clothing appearance'],
  [/\bfoto|memotret\b/i, 'photography'],
];

export function glossaryTerms(text: string, from: Language): string[] {
  const list = from === 'en' ? GLOSSARY_EN_ID : GLOSSARY_ID_EN;
  return [...new Set(list.filter(([rx]) => rx.test(text)).map(([, t]) => t))];
}

/** Local OPUS-MT models (Helsinki-NLP via transformers.js); one sentence at a time because Marian drops later sentences. */
export class LocalQueryTranslator implements QueryTranslator {
  readonly id = 'local:opus-mt (Xenova/opus-mt-en-id, Xenova/opus-mt-id-en)';
  private models = new Map<string, Promise<(t: string) => Promise<{ translation_text: string }[]>>>();

  private load(from: Language, to: Language) {
    const name = `Xenova/opus-mt-${from}-${to}`;
    if (!this.models.has(name)) {
      this.models.set(
        name,
        import('@huggingface/transformers').then(async ({ pipeline, env }) => {
          env.cacheDir = `${config.cacheDir}/models`;
          return (await pipeline('translation', name, { dtype: 'q8' })) as unknown as (t: string) => Promise<{ translation_text: string }[]>;
        }),
      );
    }
    return this.models.get(name)!;
  }

  async translate(text: string, from: Language, to: Language) {
    if (from === to) return text;
    const mt = await this.load(from, to);
    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
    const out: string[] = [];
    for (const s of sentences) out.push((await mt(s))[0]?.translation_text ?? '');
    return out.join(' ').trim();
  }
}

/** Glossary-only fallback (tests, or when the MT models are unavailable). */
export class GlossaryTranslator implements QueryTranslator {
  readonly id = 'glossary-only';
  async translate(text: string, from: Language, to: Language) {
    return from === to ? text : glossaryTerms(text, from).join(' ');
  }
}
