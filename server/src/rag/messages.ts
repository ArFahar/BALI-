import type { Category, KbChunk, Language } from '../types.js';

/** User-facing fixed strings for fallbacks, caveats and answer framing, in both supported languages. */
export const MESSAGES = {
  noMatch: {
    en: "I don't have verified information about this in the LocalNorm knowledge base for Canggu, so I won't guess. Local customs can differ between villages and even between neighbourhoods (banjar).",
    id: 'Saya belum memiliki informasi terverifikasi tentang hal ini dalam basis pengetahuan LocalNorm untuk Canggu, jadi saya tidak akan menebak. Adat setempat bisa berbeda antar desa, bahkan antar banjar.',
  },
  noMatchActions: {
    en: [
      'Ask your accommodation host or property manager — they usually know local expectations.',
      'For neighbourhood or customary matters, ask the head of the local banjar (kelian banjar) or the Desa Adat Canggu office, ideally through your host.',
      'When in doubt, observe what local people do and choose the more modest, quieter option.',
    ],
    id: [
      'Tanyakan kepada pemilik atau pengelola akomodasi — mereka biasanya memahami kebiasaan setempat.',
      'Untuk urusan lingkungan atau adat, tanyakan kepada kelian banjar atau kantor Desa Adat Canggu, sebaiknya melalui pemilik akomodasi.',
      'Jika ragu, perhatikan kebiasaan warga setempat dan pilih sikap yang lebih sopan dan tenang.',
    ],
  },
  offTopic: {
    en: 'LocalNorm AI only covers everyday social and cultural etiquette for Canggu, Bali (for example temples, ceremonies, dress, traffic, waste and neighbourhood life). Could you rephrase your question around one of these topics?',
    id: 'LocalNorm AI hanya membahas etika sosial dan budaya sehari-hari di Canggu, Bali (misalnya pura, upacara, berpakaian, lalu lintas, sampah, dan kehidupan bertetangga). Bisakah Anda menyampaikan pertanyaan terkait salah satu topik tersebut?',
  },
  outsideBali: {
    en: (place: string) => `This pilot only covers Canggu, Bali. I don't have verified guidance for ${place}, and rules from Bali should not be assumed to apply there.`,
    id: (place: string) => `Uji coba ini hanya mencakup Canggu, Bali. Saya tidak memiliki panduan terverifikasi untuk ${place}, dan aturan di Bali tidak boleh diasumsikan berlaku di sana.`,
  },
  otherBaliArea: {
    en: (place: string) => `You mentioned ${place}. LocalNorm covers Canggu only. Province-wide rules shown here apply across Bali, but village rules in ${place} are not in the knowledge base.`,
    id: (place: string) => `Anda menyebut ${place}. LocalNorm hanya mencakup Canggu. Aturan tingkat provinsi di sini berlaku di seluruh Bali, tetapi aturan desa di ${place} tidak ada dalam basis pengetahuan.`,
  },
  customaryNotFound: {
    en: 'No provision of the Desa Adat Canggu awig-awig or pararem in the knowledge base answers this. I cannot state or invent customary rules or fines; please confirm with your host or the local banjar.',
    id: 'Tidak ada ketentuan awig-awig atau pararem Desa Adat Canggu dalam basis pengetahuan yang menjawab hal ini. Saya tidak dapat menyebutkan atau mengarang aturan maupun denda adat; silakan konfirmasi kepada pemilik akomodasi atau banjar setempat.',
  },
  customaryConfirm: {
    en: 'Customary rules are applied by Desa Adat Canggu and each banjar; amounts and procedures are decided locally. Confirm with the prajuru or kelian banjar before acting on them.',
    id: 'Aturan adat dijalankan oleh Desa Adat Canggu dan masing-masing banjar; besaran dan tata caranya diputuskan setempat. Konfirmasikan kepada prajuru atau kelian banjar sebelum bertindak.',
  },
  sanctionNotStated: {
    en: 'The source shown does not state a fine or sanction for this situation. I cannot state or invent one; ask the prajuru or kelian banjar.',
    id: 'Sumber yang ditampilkan tidak menyebutkan denda atau sanksi untuk situasi ini. Saya tidak dapat menyebutkan atau mengarangnya; tanyakan kepada prajuru atau kelian banjar.',
  },
  confirmLocally: {
    en: 'Before acting on a customary rule, confirm the current practice with your host or the kelian banjar (head of the neighbourhood).',
    id: 'Sebelum bertindak berdasarkan aturan adat, konfirmasikan praktik yang berlaku saat ini kepada pemilik akomodasi atau kelian banjar.',
  },
  fabricationRefused: {
    en: 'I can only share guidance that is backed by the sources in this knowledge base; I will not make up rules.',
    id: 'Saya hanya dapat menyampaikan panduan yang didukung sumber dalam basis pengetahuan ini; saya tidak akan mengarang aturan.',
  },
  notVerified: {
    en: 'The sources used have not yet been verified by a local reviewer (status: under review / unverified). Treat this as guidance and check the original source.',
    id: 'Sumber yang digunakan belum diverifikasi oleh peninjau lokal (status: dalam peninjauan / belum terverifikasi). Anggap ini sebagai panduan dan periksa sumber aslinya.',
  },
  provinceWide: {
    en: 'These sources apply to Bali (or Indonesia) as a whole; no Canggu-specific rule was found for this question.',
    id: 'Sumber ini berlaku untuk Bali (atau Indonesia) secara umum; tidak ditemukan aturan khusus Canggu untuk pertanyaan ini.',
  },
  foreignTouristOnlyNewcomer: {
    en: 'Some of this guidance comes from rules addressed to foreign tourists. If you are an Indonesian citizen living here they may not formally apply to you, but the same respectful behaviour is expected.',
    id: 'Sebagian panduan ini berasal dari aturan yang ditujukan kepada wisatawan asing. Jika Anda WNI yang tinggal di sini, aturan tersebut mungkin tidak berlaku secara formal, tetapi perilaku hormat yang sama tetap diharapkan.',
  },
  kramaOnly: {
    en: 'This provision is addressed to registered members of the customary village (krama adat). As a visitor or newcomer it explains local practice; it is not stated as an obligation for you.',
    id: 'Ketentuan ini ditujukan kepada krama adat (warga yang terdaftar di desa adat). Bagi wisatawan atau pendatang, ini menjelaskan kebiasaan setempat dan tidak dinyatakan sebagai kewajiban Anda.',
  },
  businessOnly: {
    en: 'This provision is addressed to businesses and institutions (for example villas, restaurants and shops), not to individual visitors.',
    id: 'Ketentuan ini ditujukan kepada badan usaha dan lembaga (misalnya vila, restoran, dan toko), bukan kepada pengunjung perorangan.',
  },
  unofficialTranslation: {
    en: 'The awig-awig text is an unofficial Indonesian translation of the 2012 edition; whether this edition is still in force has not been confirmed.',
    id: 'Teks awig-awig adalah terjemahan Indonesia tidak resmi dari naskah edisi 2012; keberlakuan edisi ini belum dikonfirmasi.',
  },
  historical2022: {
    en: 'The noise limits mentioned come from a 2022 agreement; current limits and venue hours may differ.',
    id: 'Batas kebisingan yang disebut berasal dari kesepakatan tahun 2022; batas dan jam operasional saat ini bisa berbeda.',
  },
  ocrText: {
    en: 'Part of the source text was read by OCR from a scanned PDF; check wording against the original document.',
    id: 'Sebagian teks sumber dibaca dengan OCR dari PDF hasil pindai; periksa kata-katanya pada dokumen asli.',
  },
  llmSummary: {
    en: 'This answer is an AI-written summary of the cited sources. Where it differs from the source text, the source text prevails.',
    id: 'Jawaban ini adalah ringkasan yang ditulis AI dari sumber yang dikutip. Jika berbeda dengan teks sumber, teks sumber yang berlaku.',
  },
  quotedInOtherLanguage: {
    en: 'The source is in Indonesian, so it is quoted in its original language rather than machine-translated.',
    id: 'Sumber berbahasa Inggris, sehingga dikutip dalam bahasa aslinya, bukan diterjemahkan mesin.',
  },
  weakMatch: {
    en: 'The closest information I found only partly matches your question.',
    id: 'Informasi terdekat yang saya temukan hanya sebagian sesuai dengan pertanyaan Anda.',
  },
} as const;

export function msg<K extends keyof typeof MESSAGES>(key: K, lang: Language): (typeof MESSAGES)[K]['en'] {
  return MESSAGES[key][lang] as (typeof MESSAGES)[K]['en'];
}

const KIND: Record<string, Record<Language, string>> = {
  customary_law: { en: 'a customary rule of Desa Adat Canggu', id: 'aturan adat Desa Adat Canggu' },
  government_regulation: { en: 'a government regulation', id: 'peraturan pemerintah' },
  research_summary: { en: 'general guidance compiled from public sources', id: 'panduan umum yang disusun dari sumber publik' },
};

const CATEGORY_TEXT: Record<Category, Record<Language, string>> = {
  religious_etiquette: { en: 'religious etiquette', id: 'etika keagamaan' },
  sacred_places: { en: 'sacred places', id: 'tempat suci' },
  public_behavior: { en: 'public behaviour', id: 'perilaku di tempat umum' },
  neighborhood_etiquette: { en: 'neighbourhood life', id: 'kehidupan bertetangga' },
  environmental_etiquette: { en: 'the environment and waste', id: 'lingkungan dan sampah' },
  traffic_etiquette: { en: 'traffic and roads', id: 'lalu lintas dan jalan' },
  social_interaction: { en: 'social interaction', id: 'interaksi sosial' },
  customary_context: { en: 'customary institutions', id: 'kelembagaan adat' },
};

/**
 * Framing sentence for an extractive answer: it says what the source is, in the user's language, without
 * paraphrasing rule content (that stays in the verbatim quote shown below it).
 */
export function sourceFrame(chunk: KbChunk, lang: Language): string {
  const kind = (KIND[chunk.source_subtype ?? ''] ?? KIND.government_regulation)[lang];
  const where = chunk.articles.length ? ` (${chunk.articles.join(', ')})` : '';
  const topic = CATEGORY_TEXT[chunk.category][lang];
  const sameLanguage = chunk.language === lang;
  if (lang === 'en') {
    const tail = sameLanguage ? 'The relevant passage is quoted below.' : 'It is written in Indonesian; the relevant passage is quoted below in its original wording.';
    return `The most relevant source on ${topic} is ${kind}: ${chunk.document_title}${where}. ${tail}`;
  }
  const tail = sameLanguage ? 'Bagian yang relevan dikutip di bawah.' : 'Sumber ini berbahasa Inggris; bagian yang relevan dikutip di bawah dalam bahasa aslinya.';
  return `Sumber yang paling relevan tentang ${topic} adalah ${kind}: ${chunk.document_title}${where}. ${tail}`;
}
