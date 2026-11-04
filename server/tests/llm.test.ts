import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmError, SumoPodClient } from '../src/rag/llm.js';

const draft = {
  answer: 'Wear a helmet when riding a motorcycle.',
  why_it_matters: 'It protects road users.',
  recommended_actions: ['Wear a helmet.'],
  used_source_ids: ['S1'],
  category: 'traffic',
  uncertainty_note: null,
};

afterEach(() => vi.unstubAllGlobals());

function completion(content: unknown, finishReason = 'stop') {
  return Response.json({ choices: [{ finish_reason: finishReason, message: { content } }] });
}

describe('SumoPod client', () => {
  it('sends the requested model and source prompts to Chat Completions with server-side authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion(JSON.stringify(draft)));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SumoPodClient('test-secret', 'deepseek-v4-flash', 1000, 'https://ai.sumopod.com/v1/');
    expect(await client.generate('Use only the supplied sources. Return JSON.', 'S1: helmet guidance')).toEqual(draft);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ai.sumopod.com/v1/chat/completions');
    expect(url).not.toContain('test-secret');
    expect(options.headers.authorization).toBe('Bearer test-secret');
    expect(JSON.parse(options.body)).toMatchObject({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'system', content: expect.stringContaining('Use only the supplied sources. Return JSON.') },
        { role: 'user', content: 'S1: helmet guidance' }],
      response_format: { type: 'json_object' }, stream: false,
    });
    expect(client.id).toBe('sumopod:deepseek-v4-flash');
  });

  it('keeps provider error bodies out of application logs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('test-secret provider details', { status: 401 })));
    await expect(new SumoPodClient('test-secret').generate('JSON', 'hello'))
      .rejects.toEqual(new LlmError('SumoPod request failed with HTTP 401', 401));
  });

  it.each([
    ['malformed JSON', '{'],
    ['invalid fields', JSON.stringify({ ...draft, used_source_ids: 'S1' })],
    ['null payload', 'null'],
    ['empty content', ''],
  ])('rejects %s so the pipeline can use its extractive fallback', async (_label, content) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(content)));
    await expect(new SumoPodClient('test-secret').generate('JSON', 'hello')).rejects.toBeInstanceOf(LlmError);
  });

  it('rejects truncated JSON even when the partial content parses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(JSON.stringify(draft), 'length')));
    await expect(new SumoPodClient('test-secret').generate('JSON', 'hello')).rejects.toThrow('incomplete');
  });

  it('aborts requests that exceed the configured timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true });
    })));
    await expect(new SumoPodClient('test-secret', 'deepseek-v4-flash', 10).generate('JSON', 'hello'))
      .rejects.toThrow('SumoPod request timed out');
  });
});
