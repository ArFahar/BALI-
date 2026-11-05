import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { FileFeedbackStore } from '../src/feedback.js';
import type { KbStore } from '../src/kb/store.js';
import { makePipeline } from './helpers.js';

let app: ReturnType<typeof createApp>;
const feedbackFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ln-')), 'feedback.jsonl');

beforeAll(async () => {
  const { pipeline, store } = await makePipeline();
  app = createApp({
    pipeline,
    store,
    feedback: new FileFeedbackStore(feedbackFile),
    info: { llm: null, embedder: 'test:hash', translator: 'glossary-only', corsOrigins: ['http://localhost:5173'] },
    rateLimitPerMinute: 0,
  });
});

const valid = { message: 'Do I need a motorcycle helmet on the road?', language: 'en', user_type: 'tourist', location: 'canggu' };

describe('API', () => {
  it('GET /api/health reports dependencies without secrets', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
    expect(r.body.dependencies.knowledge_base.chunks).toBe(6);
    expect(r.body.dependencies.query_translation).toBe('glossary-only');
    expect(r.body.dependencies.llm.configured).toBe(false);
    expect(JSON.stringify(r.body)).not.toMatch(/AIza|api_key|password|postgres(ql)?:\/\//i);
  });

  it('GET /api/health returns 503 when the store is down', async () => {
    const { pipeline } = await makePipeline();
    const down: KbStore = { kind: 'pgvector', count: async () => 0, search: async () => [], categories: async () => [], embeddingModel: async () => null, ping: async () => false };
    const a = createApp({ pipeline, store: down, feedback: new FileFeedbackStore(feedbackFile), info: { llm: null, embedder: 'x', translator: null, corsOrigins: [] }, rateLimitPerMinute: 0 });
    const r = await request(a).get('/api/health');
    expect(r.status).toBe(503);
    expect(r.body.status).toBe('degraded');
  });

  it('GET /api/knowledge/categories lists all 8 categories with counts and labels', async () => {
    const r = await request(app).get('/api/knowledge/categories');
    expect(r.status).toBe(200);
    expect(r.body.categories).toHaveLength(8);
    expect(r.body.categories[0]).toHaveProperty('label.id');
    const env = r.body.categories.find((c: { id: string }) => c.id === 'environmental_etiquette');
    expect(env).toMatchObject({ documents: 2, chunks: 2 });
  });

  it('POST /api/chat returns the documented response shape', async () => {
    const r = await request(app).post('/api/chat').send(valid);
    expect(r.status).toBe(200);
    for (const k of ['conversation_id', 'answer', 'category', 'recommended_actions', 'quote', 'sources', 'source_classification', 'retrieval_status', 'confidence', 'fallback_used', 'generation_mode', 'caveats', 'search_translation']) {
      expect(r.body).toHaveProperty(k);
    }
  });

  it.each([
    [{ ...valid, message: '' }, 'message'],
    [{ ...valid, message: 'x'.repeat(1001) }, 'message'],
    [{ ...valid, language: 'fr' }, 'language'],
    [{ ...valid, user_type: 'resident' }, 'user_type'],
    [{ ...valid, location: 'ubud' }, 'location'],
    [{ ...valid, conversation_id: 'not-a-uuid' }, 'conversation_id'],
  ])('POST /api/chat rejects invalid input (%#)', async (body, field) => {
    const r = await request(app).post('/api/chat').send(body);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(r.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
  });

  it('POST /api/chat rejects malformed JSON', async () => {
    const r = await request(app).post('/api/chat').set('content-type', 'application/json').send('{"message":');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_JSON');
  });

  it('POST /api/feedback stores feedback', async () => {
    const chat = await request(app).post('/api/chat').send(valid);
    const r = await request(app)
      .post('/api/feedback')
      .send({ conversation_id: chat.body.conversation_id, rating: 'helpful', source_ids: ['CANGGU-AWIG-2012-ID::Pasal-4#1'], language: 'en' });
    expect(r.status).toBe(201);
    expect(fs.readFileSync(feedbackFile, 'utf8')).toContain('"rating":"helpful"');
  });

  it('POST /api/feedback validates rating', async () => {
    const r = await request(app).post('/api/feedback').send({ conversation_id: crypto.randomUUID(), rating: 'meh' });
    expect(r.status).toBe(400);
  });

  it('unknown API route returns 404 JSON', async () => {
    const r = await request(app).get('/api/nope');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });
});
