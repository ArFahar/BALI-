/** Prints full answers for a few questions (manual tone review). Usage: tsx src/scripts/tone-probe.ts [label] */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bootstrap } from '../bootstrap.js';

const QUESTIONS: [string, 'en' | 'id', 'tourist' | 'newcomer'][] = [
  ['Do I have to report to the banjar when I rent a house?', 'en', 'newcomer'],
  ['Apa yang tidak boleh dilakukan saat Nyepi?', 'id', 'tourist'],
  ['Bagaimana memilah sampah di rumah?', 'id', 'newcomer'],
  ['Can I wear a bikini when visiting a temple?', 'en', 'tourist'],
  ['Is it okay to step over the small offerings on the sidewalk?', 'en', 'tourist'],
];

const { pipeline } = await bootstrap();
const out: string[] = [];
for (const [message, language, user_type] of QUESTIONS) {
  const t = Date.now();
  const r = await pipeline.handle({ message, language, user_type, location: 'canggu' });
  out.push(
    `### ${message} (${language}, ${user_type})\nmode=${r.generation_mode} status=${r.retrieval_status} sources=${r.sources.map((s) => s.id).join(', ')} ${Date.now() - t}ms\n\n` +
      `ANSWER: ${r.answer}\n\nWHY: ${r.why_it_matters ?? '-'}\n\nACTIONS:\n${r.recommended_actions.map((a) => `- ${a}`).join('\n') || '-'}\n\nCAVEATS:\n${r.caveats.map((c) => `- ${c}`).join('\n')}\n`,
  );
}
const dir = path.join(os.tmpdir(), 'localnorm-tone');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${process.argv[2] ?? 'probe'}.md`), out.join('\n---\n\n'));
console.log(out.join('\n---\n\n'));
process.exit(0);
