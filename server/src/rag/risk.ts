import type { RiskLevel } from '../types.js';
import type { Classification } from './classifier.js';

/**
 * Risk-based reasoning policy (deterministic, testable). Decides how much the answer must rest on retrieved evidence:
 * - high: whether something is allowed / required / forbidden at rituals, sacred places, in customary or state rules,
 *   fines and permits. General knowledge must not answer these; without evidence the assistant abstains.
 * - low: definitions, food/cuisine, language, history, recommendations. General knowledge may answer (labelled).
 * - medium: everything else (social etiquette). General knowledge may answer with a caveat.
 */
const PERMISSION =
  /\b(boleh|bolehkah|diperbolehkan|dibolehkan|dilarang|larangan|terlarang|wajib|harus|aturan|izin|ijin|pantangan|haram|halal|allowed|permitted|forbidden|prohibited|banned|must|required|obligat\w*|rules?|laws?|legal|illegal|permits?|can i|may i|am i allowed|is it okay|is it ok|do i have to|do i need|perlu|perlukah)\b/i;
const SENSITIVE =
  /\b(upacara|ritual|ritus|odalan|piodalan|sembahyang|persembahyangan|pura|merajan|pelinggih|adat|awig|pararem|banjar|desa|nyepi|galungan|kuningan|ngaben|melasti|banten|canang|sesajen|suci|cuntaka|sebel|ceremon\w*|temples?|shrines?|offerings?|sacred|holy|customary|village|regulation|police|visa|licen[cs]e|helmet|helm|sim|polisi)\b/i;
const GENERAL =
  /\b(apa itu|apa arti|arti(nya)?|apa perbedaan|perbedaan|bedanya|sejarah|asal[- ]usul|makanan khas|kuliner|resep|rekomendasi|sarankan|tempat wisata|cara (menyapa|mengucapkan|bilang)|bahasa bali|what is|what are|what does|meaning|difference between|history|origin|typical food|local food|cuisine|recipe|recommend\w*|how do (you|i) say|how to say|balinese word)\b/i;

/** Legal / administrative matters always need an authoritative source (immigration, permits, tax, licences). */
const LEGAL =
  /\b(visa|imigrasi|immigration|kitas|kitap|izin tinggal|residence permit|overstay|deport\w*|pajak|tax(es)?|sim internasional|international driving permit|idp|paspor|passport|work permit|izin kerja)\b/i;

export function assessRisk(message: string, cls: Pick<Classification, 'asksCustomaryRule' | 'fabricationAttempt'>): RiskLevel {
  if (cls.asksCustomaryRule || cls.fabricationAttempt) return 'high';
  if (/\b(fines?|penalt\w*|sanctions?|denda|sanksi|hukuman)\b/i.test(message)) return 'high';
  if (LEGAL.test(message)) return 'high';
  if (PERMISSION.test(message) && SENSITIVE.test(message)) return 'high';
  if (GENERAL.test(message) && !PERMISSION.test(message)) return 'low';
  return 'medium';
}
