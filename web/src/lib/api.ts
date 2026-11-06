import type { Category, ChatResponse, Language, Settings } from './types';

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 45000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status, body?.error?.code);
    }
    return body as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error).name === 'AbortError') throw new ApiError('The request timed out.', 0, 'TIMEOUT');
    throw new ApiError('Cannot reach the Mawacara AI server.', 0, 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
}

export function sendChat(message: string, settings: Settings, conversationId?: string) {
  return request<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      message,
      language: settings.language,
      user_type: settings.userType,
      location: settings.location,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }),
  });
}

export function sendFeedback(input: {
  conversation_id: string;
  message_id: string;
  rating: 'helpful' | 'not_helpful';
  source_ids: string[];
  language: Language;
}) {
  return request<{ status: string }>('/api/feedback', { method: 'POST', body: JSON.stringify(input) });
}

export function getCategories() {
  return request<{ location: string; categories: Category[] }>('/api/knowledge/categories');
}
