import type { Language } from '../types.js';

/** User-facing fixed strings for fallbacks and caveats, in both supported languages. */
export const MESSAGES = {
  noMatch: {
    en: "I don't have verified information about this in the LocalNorm knowledge base for Canggu, so I won't guess. Local customs can differ between villages and even between neighbourhoods (banjar).",
    id: 'Saya belum memiliki informasi terverifikasi tentang hal ini dalam basis pengetahuan LocalNorm untuk Canggu, jadi saya tidak akan menebak. Adat setempat bisa berbeda antar desa, bahkan antar banjar.',
  },
  noMatchActions: {
    en: [
      'Ask your accommodation host or property manager — they usually know local expectations.',
      'For neighbourhood or customary matters, ask the head of the local banjar (kelian banjar) or the Desa Adat office, ideally through your host.',
      'When in doubt, observe what local people do and choose the more modest, quieter option.',
    ],
    id: [
      'Tanyakan kepada pemilik atau pengelola akomodasi — mereka biasanya memahami kebiasaan setempat.',
      'Untuk urusan lingkungan atau adat, tanyakan kepada kelian banjar atau kantor Desa Adat, sebaiknya melalui pemilik akomodasi.',
      'Jika ragu, perhatikan kebiasaan warga setempat dan pilih sikap yang lebih sopan dan tenang.',
    ],
  },
  offTopic: {
    en: 'LocalNorm AI only covers everyday social and cultural etiquette for Canggu, Bali (for example temples, ceremonies, dress, scooters, waste, accommodation and neighbourhood life). Could you rephrase your question around one of these topics?',
    id: 'LocalNorm AI hanya membahas etika sosial dan budaya sehari-hari di Canggu, Bali (misalnya pura, upacara, berpakaian, berkendara, sampah, akomodasi, dan kehidupan bertetangga). Bisakah Anda menyampaikan pertanyaan terkait salah satu topik tersebut?',
  },
  outsideBali: {
    en: (place: string) =>
      `This pilot only covers Canggu, Bali. I don't have verified guidance for ${place}, and rules from Bali should not be assumed to apply there.`,
    id: (place: string) =>
      `Uji coba ini hanya mencakup Canggu, Bali. Saya tidak memiliki panduan terverifikasi untuk ${place}, dan aturan di Bali tidak boleh diasumsikan berlaku di sana.`,
  },
  otherBaliArea: {
    en: (place: string) =>
      `You mentioned ${place}. LocalNorm currently covers Canggu only. Province-wide rules shown here apply across Bali, but village-specific customs in ${place} have not been verified.`,
    id: (place: string) =>
      `Anda menyebut ${place}. LocalNorm saat ini hanya mencakup Canggu. Aturan tingkat provinsi di sini berlaku di seluruh Bali, tetapi adat khusus desa di ${place} belum diverifikasi.`,
  },
  customaryUnavailable: {
    en: 'No verified Desa Adat Canggu or banjar rules (awig-awig / pararem) are in the knowledge base yet. I cannot state or invent customary rules or fines; please confirm with your host or the local banjar.',
    id: 'Belum ada aturan Desa Adat Canggu atau banjar (awig-awig / pararem) yang terverifikasi dalam basis pengetahuan. Saya tidak dapat menyebutkan atau mengarang aturan maupun denda adat; silakan konfirmasi kepada pemilik akomodasi atau banjar setempat.',
  },
  fabricationRefused: {
    en: 'I can only share guidance that is backed by the sources in this knowledge base; I will not make up rules.',
    id: 'Saya hanya dapat menyampaikan panduan yang didukung sumber dalam basis pengetahuan ini; saya tidak akan mengarang aturan.',
  },
  notVerified: {
    en: 'The sources used have not yet been verified by a local reviewer (status: under review / unverified). Please treat this as guidance and check the original source.',
    id: 'Sumber yang digunakan belum diverifikasi oleh peninjau lokal (status: dalam peninjauan / belum terverifikasi). Anggap ini sebagai panduan dan periksa sumber aslinya.',
  },
  demoData: {
    en: 'Part of this answer is general etiquette advice written by the LocalNorm team (DEMO_DATA), not an official rule or a community-approved guideline.',
    id: 'Sebagian jawaban ini adalah saran etika umum yang ditulis tim LocalNorm (DEMO_DATA), bukan aturan resmi maupun panduan yang disetujui komunitas.',
  },
  provinceWide: {
    en: 'These sources apply to Bali (or Indonesia) as a whole; no Canggu-specific verified rule was found for this question.',
    id: 'Sumber ini berlaku untuk Bali (atau Indonesia) secara umum; tidak ditemukan aturan khusus Canggu yang terverifikasi untuk pertanyaan ini.',
  },
  foreignTouristOnlyNewcomer: {
    en: 'Some of these rules are addressed specifically to foreign tourists. If you are a newcomer who is an Indonesian citizen they may not formally apply to you, but the same respectful behaviour is expected.',
    id: 'Sebagian aturan ini ditujukan khusus kepada wisatawan asing. Jika Anda pendatang berkewarganegaraan Indonesia, aturan tersebut mungkin tidak berlaku secara formal, tetapi perilaku hormat yang sama tetap diharapkan.',
  },
  weakMatch: {
    en: 'The closest information I found only partly matches your question.',
    id: 'Informasi terdekat yang saya temukan hanya sebagian sesuai dengan pertanyaan Anda.',
  },
} as const;

export function msg<K extends keyof typeof MESSAGES>(key: K, lang: Language): (typeof MESSAGES)[K]['en'] {
  return MESSAGES[key][lang] as (typeof MESSAGES)[K]['en'];
}
