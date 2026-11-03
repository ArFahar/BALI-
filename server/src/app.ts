import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { CATEGORIES, LANGUAGES, SUPPORTED_LOCATIONS, USER_TYPES } from './types.js';
import type { FeedbackStore } from './feedback.js';
import type { RagPipeline } from './rag/pipeline.js';
import type { VectorStore } from './rag/vectorStore.js';

export interface AppDeps {
  pipeline: RagPipeline;
  store: VectorStore;
  feedback: FeedbackStore;
  info: { llm: string | null; embedder: string; corsOrigins: string[] };
  /** Disable rate limiting in tests. */
  rateLimitPerMinute?: number;
}

const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], { en: string; id: string }> = {
  neighborhood: { en: 'Neighbourhood etiquette', id: 'Etika bertetangga' },
  waste_management: { en: 'Waste management', id: 'Pengelolaan sampah' },
  public_behavior: { en: 'Public behaviour', id: 'Perilaku di tempat umum' },
  religious_cultural: { en: 'Religious & cultural etiquette', id: 'Etika keagamaan & budaya' },
  sacred_place: { en: 'Sacred places', id: 'Tempat suci' },
  traffic: { en: 'Traffic etiquette', id: 'Etika berlalu lintas' },
  social_interaction: { en: 'Social interaction', id: 'Interaksi sosial' },
  accommodation: { en: 'Accommodation', id: 'Akomodasi' },
};

export const chatSchema = z.object({
  message: z.string().trim().min(2, 'message is too short').max(1000, 'message must be at most 1000 characters'),
  language: z.enum(LANGUAGES),
  user_type: z.enum(USER_TYPES),
  location: z.enum(SUPPORTED_LOCATIONS, {
    errorMap: () => ({ message: 'location must be "canggu" — the MVP pilot supports Canggu only' }),
  }),
  conversation_id: z.string().uuid().optional(),
});

export const feedbackSchema = z.object({
  conversation_id: z.string().uuid(),
  message_id: z.string().max(100).optional(),
  rating: z.enum(['helpful', 'not_helpful']),
  comment: z.string().trim().max(500).optional(),
  source_ids: z.array(z.string().regex(/^ln-\d{3}$/)).max(10).optional(),
  language: z.enum(LANGUAGES).optional(),
});

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Request body is invalid',
      r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: deps.info.corsOrigins, methods: ['GET', 'POST'] }));
  app.use(express.json({ limit: '16kb' }));

  if (deps.rateLimitPerMinute !== 0) {
    app.use(
      '/api/',
      rateLimit({
        windowMs: 60_000,
        limit: deps.rateLimitPerMinute ?? 30,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (_req, res) =>
          res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, please wait a minute.' } }),
      }),
    );
  }

  app.get(
    '/api/health',
    asyncRoute(async (_req, res) => {
      const [dbOk, docs] = await Promise.all([deps.store.ping(), deps.store.count().catch(() => 0)]);
      const ok = dbOk && docs > 0;
      res.status(ok ? 200 : 503).json({
        status: ok ? 'ok' : 'degraded',
        version: '0.1.0',
        dependencies: {
          vector_store: { kind: deps.store.kind, ok: dbOk, chunks: docs },
          embeddings: { provider: deps.info.embedder, ok: true },
          llm: deps.info.llm
            ? { provider: deps.info.llm, configured: true }
            : { provider: null, configured: false, note: 'No LLM key configured; answers use extractive grounded mode.' },
          feedback_store: deps.feedback.kind,
        },
        time: new Date().toISOString(),
      });
    }),
  );

  app.get(
    '/api/knowledge/categories',
    asyncRoute(async (_req, res) => {
      const counts = new Map((await deps.store.categories()).map((c) => [c.category, c.documents]));
      res.json({
        location: 'canggu',
        categories: CATEGORIES.map((id) => ({ id, label: CATEGORY_LABELS[id], documents: counts.get(id) ?? 0 })),
      });
    }),
  );

  app.post(
    '/api/chat',
    asyncRoute(async (req, res) => {
      const body = parse(chatSchema, req.body);
      res.json(await deps.pipeline.handle(body));
    }),
  );

  app.post(
    '/api/feedback',
    asyncRoute(async (req, res) => {
      const body = parse(feedbackSchema, req.body);
      await deps.feedback.save(body);
      res.status(201).json({ status: 'recorded' });
    }),
  );

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } });
      return;
    }
    if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
      return;
    }
    console.error('[error]', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
  });

  return app;
}
