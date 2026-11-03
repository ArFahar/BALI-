import fs from 'node:fs';
import { z } from 'zod';
import {
  CATEGORIES,
  DOCUMENT_SCOPES,
  LANGUAGES,
  SOURCE_TYPES,
  VALIDATION_STATUSES,
  type KnowledgeChunk,
} from '../types.js';

const translationSchema = z.object({
  title: z.string().min(3),
  content: z.string().min(20),
  why: z.string().min(10),
  actions: z.array(z.string().min(3)).min(1),
});

const scenarioSchema = z
  .object({
    id: z.string().regex(/^ln-\d{3}$/),
    category: z.enum(CATEGORIES),
    location: z.enum(DOCUMENT_SCOPES),
    applies_to: z.array(z.enum(['everyone', 'foreign_tourist'])).min(1),
    source_name: z.string().min(3),
    source_url: z.string().url().nullable(),
    source_type: z.enum(SOURCE_TYPES),
    validation_status: z.enum(VALIDATION_STATUSES),
    validated_by: z.string().nullable(),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    last_verified_at: z.string().nullable(),
    is_demo_data: z.boolean(),
    notes: z.string().nullable(),
    translations: z.object({ en: translationSchema, id: translationSchema }),
  })
  .superRefine((s, ctx) => {
    // Integrity rules that protect against fabricated authority.
    if (s.validation_status === 'VERIFIED' && (!s.validated_by || !s.last_verified_at)) {
      ctx.addIssue({ code: 'custom', message: `${s.id}: VERIFIED requires validated_by and last_verified_at` });
    }
    if (s.source_type === 'COMMUNITY_VERIFIED' && s.validation_status === 'VERIFIED' && !s.validated_by) {
      ctx.addIssue({ code: 'custom', message: `${s.id}: COMMUNITY_VERIFIED needs a named validator` });
    }
    if (s.is_demo_data && s.validation_status === 'VERIFIED') {
      ctx.addIssue({ code: 'custom', message: `${s.id}: DEMO_DATA can never be VERIFIED` });
    }
    if (s.source_type === 'OFFICIAL_REGULATION' && !s.source_url) {
      ctx.addIssue({ code: 'custom', message: `${s.id}: OFFICIAL_REGULATION needs a source_url` });
    }
  });

const fileSchema = z.object({
  meta: z.record(z.unknown()),
  scenarios: z.array(scenarioSchema).min(1),
});

export type Scenario = z.infer<typeof scenarioSchema>;

export function parseKnowledge(raw: unknown): Scenario[] {
  const parsed = fileSchema.parse(raw);
  const ids = new Set<string>();
  for (const s of parsed.scenarios) {
    if (ids.has(s.id)) throw new Error(`Duplicate scenario id ${s.id}`);
    ids.add(s.id);
  }
  return parsed.scenarios;
}

/** Flatten scenarios into one chunk per language. */
export function toChunks(scenarios: Scenario[]): KnowledgeChunk[] {
  return scenarios.flatMap((s) =>
    LANGUAGES.map((language) => {
      const t = s.translations[language];
      return {
        id: `${s.id}-${language}`,
        doc_id: s.id,
        language,
        title: t.title,
        content: t.content,
        why: t.why,
        actions: t.actions,
        category: s.category,
        location: s.location,
        applies_to: s.applies_to,
        source_name: s.source_name,
        source_url: s.source_url,
        source_type: s.source_type,
        validation_status: s.validation_status,
        validated_by: s.validated_by,
        effective_date: s.effective_date,
        last_verified_at: s.last_verified_at,
        is_demo_data: s.is_demo_data,
        notes: s.notes,
      } satisfies KnowledgeChunk;
    }),
  );
}

export function loadKnowledgeFile(filePath: string): KnowledgeChunk[] {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return toChunks(parseKnowledge(raw));
}

/** Text that gets embedded for a chunk. Title + body carries the most signal. */
export function embeddingText(c: KnowledgeChunk): string {
  return `${c.title}. ${c.content} ${c.actions.join(' ')}`;
}
