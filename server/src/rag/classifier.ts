import type { Category, Language } from '../types.js';

/**
 * Lightweight, deterministic intent & context classification (step 2 of the pipeline).
 * It does not decide the answer; it routes the request and raises safety flags.
 */

// Keys are the v2 knowledge-base categories; `customary_context` is background and is never required to match.
const CATEGORY_KEYWORDS: Record<Exclude<Category, 'customary_context'>, string[]> = {
  sacred_places: ['temple', 'pura', 'shrine', 'pelinggih', 'sacred', 'suci', 'sakral', 'holy', 'tree', 'pohon', 'poleng', 'altar', 'mandala', 'menstrua', 'datang bulan', 'haid', 'kahyangan', 'setra', 'cemetery', 'kuburan', 'pratima', 'statue', 'arca'],
  religious_etiquette: ['ceremony', 'upacara', 'procession', 'prosesi', 'nyepi', 'galungan', 'kuningan', 'offering', 'canang', 'sesajen', 'banten', 'ngaben', 'cremation', 'religion', 'agama', 'hindu', 'pray', 'sembahyang', 'ogoh', 'melasti', 'pecalang', 'odalan', 'piodalan', 'kulkul'],
  public_behavior: ['dress', 'clothes', 'clothing', 'bikini', 'shirtless', 'topless', 'swimwear', 'pakaian', 'baju', 'busana', 'telanjang', 'sopan', 'polite', 'public', 'umum', 'drunk', 'mabuk', 'photo', 'photograph', 'foto', 'memotret', 'nightlife', 'beach club', 'bar', 'club', 'klub'],
  social_interaction: ['argue', 'argument', 'angry', 'marah', 'conflict', 'konflik', 'fight', 'bertengkar', 'social media', 'media sosial', 'viral', 'rude', 'kasar', 'bargain', 'tawar', 'greet', 'sapa', 'balinese language', 'bahasa bali', 'dispute', 'sengketa', 'wicara', 'police', 'polisi', 'aparat', 'customary', 'adat', 'awig', 'pararem'],
  neighborhood_etiquette: ['neighbour', 'neighbor', 'tetangga', 'noise', 'noisy', 'bising', 'berisik', 'party', 'pesta', 'music', 'musik', 'banjar', 'villa', 'vila', 'night', 'malam', 'residential', 'permukiman', 'stay', 'staying', 'tinggal', 'move', 'report', 'register', 'melapor', 'lapor', 'tamiu', 'newcomer', 'pendatang', 'security', 'keamanan'],
  environmental_etiquette: ['waste', 'trash', 'rubbish', 'garbage', 'sampah', 'plastic', 'plastik', 'straw', 'sedotan', 'styrofoam', 'recycl', 'daur ulang', 'litter', 'bottle', 'botol', 'organic', 'organik', 'buang', 'pilah', 'memilah', 'pemilahan', 'beach', 'pantai', 'river', 'sungai', 'spring', 'mata air', 'lake', 'danau', 'sea', 'laut', 'subak', 'rice field', 'sawah', 'environment', 'lingkungan'],
  traffic_etiquette: ['scooter', 'motorbike', 'motorcycle', 'motor', 'helmet', 'helm', 'license', 'licence', 'sim', 'driving', 'drive', 'ride', 'riding', 'berkendara', 'mengemudi', 'traffic', 'lalu lintas', 'road', 'jalan', 'idp', 'passenger', 'bonceng', 'park', 'parking', 'parkir', 'pedestrian', 'pejalan kaki', 'sidewalk', 'trotoar', 'cycling', 'bicycle', 'sepeda'],
};

/** Other Bali areas: the pilot does not hold location-specific knowledge for them. */
const OTHER_BALI_AREAS = ['ubud', 'seminyak', 'uluwatu', 'kuta', 'sanur', 'nusa penida', 'nusa dua', 'jimbaran', 'amed', 'lovina', 'munduk', 'sidemen', 'denpasar', 'pererenan', 'tabanan', 'karangasem', 'singaraja', 'kintamani', 'besakih'];
/** Places outside Bali entirely. */
const OUTSIDE_BALI = ['jakarta', 'lombok', 'gili', 'yogyakarta', 'jogja', 'bandung', 'surabaya', 'labuan bajo', 'komodo', 'flores', 'java', 'jawa', 'sumatra', 'thailand', 'bangkok', 'phuket', 'singapore', 'malaysia', 'vietnam', 'japan', 'tokyo'];

const CUSTOMARY_RULE_PATTERNS = [/awig[- ]?awig/i, /pararem/i, /desa adat/i, /customary (law|rule|fine)/i, /adat (rule|law|fine)/i, /denda adat/i, /aturan (banjar|adat)/i, /hukum adat/i, /banjar (rule|regulation|fine)/i, /sanksi adat/i];

const FABRICATION_PATTERNS = [
  /\b(make|making) (up|something up)\b/i,
  /\binvent\b/i,
  /\bpretend\b/i,
  /\bjust (guess|tell me anything)\b/i,
  /\beven if (you('re| are) not sure|it('s| is) not (true|verified))\b/i,
  /\bignore (your|the|all|previous) (rules|instructions|sources)\b/i,
  /\bkarang(lah|kan)?\b/i,
  /\bbuat(kan|lah)? (saja )?aturan\b/i,
  /\bmengarang\b/i,
  /\babaikan (aturan|instruksi|sumber)\b/i,
  /\bwrite (a|me a) (new )?(customary|local) (rule|law)\b/i,
];

const ID_MARKERS = ['yang', 'apa', 'apakah', 'bagaimana', 'boleh', 'tidak', 'saya', 'di', 'ke', 'dan', 'untuk', 'harus', 'kalau', 'jika', 'bisa', 'tolong', 'gimana', 'nggak', 'gak', 'aku', 'dengan', 'ini', 'itu', 'saat', 'ketika'];
const EN_MARKERS = ['the', 'what', 'how', 'can', 'should', 'is', 'are', 'do', 'i', 'my', 'to', 'and', 'for', 'when', 'it', 'a', 'in', 'of', 'there', 'about', 'with'];

export interface Classification {
  category: Category | null;
  categoryScores: Partial<Record<Category, number>>;
  detectedLanguage: Language | null;
  mentionsOtherBaliArea: string | null;
  mentionsOutsideBali: string | null;
  asksCustomaryRule: boolean;
  fabricationAttempt: boolean;
}

function words(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean);
}

function containsTerm(lower: string, tokens: Set<string>, term: string) {
  // Multi-word or prefix terms (e.g. "recycl") are matched as substrings; single short words must match whole tokens.
  if (term.includes(' ') || term.length >= 6) return lower.includes(term);
  // English plurals: "bars", "clubs", "beaches".
  return tokens.has(term) || tokens.has(`${term}s`) || tokens.has(`${term}es`);
}

export function detectLanguage(text: string): Language | null {
  const ws = words(text);
  if (ws.length === 0) return null;
  let id = 0;
  let en = 0;
  for (const w of ws) {
    if (ID_MARKERS.includes(w)) id++;
    if (EN_MARKERS.includes(w)) en++;
  }
  if (id === en) return null;
  return id > en ? 'id' : 'en';
}

export function classify(message: string): Classification {
  const lower = message.toLowerCase();
  const tokens = new Set(words(message));

  const categoryScores: Partial<Record<Category, number>> = {};
  for (const [cat, terms] of Object.entries(CATEGORY_KEYWORDS) as [Category, string[]][]) {
    const hits = terms.filter((t) => containsTerm(lower, tokens, t)).length;
    if (hits) categoryScores[cat] = hits;
  }
  const ranked = Object.entries(categoryScores).sort((a, b) => b[1] - a[1]);

  // A place counts as the *subject* of the question unless it is only the user's origin ("from Jakarta", "dari Jakarta").
  const findPlace = (list: string[]) =>
    list.find((p) => {
      const present = p.includes(' ') ? lower.includes(p) : tokens.has(p);
      return present && !new RegExp(`\\b(from|dari|asal)\\s+${p}\\b`).test(lower);
    }) ?? null;
  const mentionsBali = /\b(canggu|bali)\b/.test(lower);

  return {
    category: (ranked[0]?.[0] as Category) ?? null,
    categoryScores,
    detectedLanguage: detectLanguage(message),
    mentionsOtherBaliArea: lower.includes('canggu') ? null : findPlace(OTHER_BALI_AREAS),
    mentionsOutsideBali: mentionsBali ? null : findPlace(OUTSIDE_BALI),
    asksCustomaryRule: CUSTOMARY_RULE_PATTERNS.some((p) => p.test(message)),
    fabricationAttempt: FABRICATION_PATTERNS.some((p) => p.test(message)),
  };
}
