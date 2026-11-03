import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUp, Loader2, MessageSquarePlus, RotateCw } from 'lucide-react';
import { getCategories, sendChat } from '../lib/api';
import { t } from '../lib/i18n';
import type { Category, ChatMessage, Settings } from '../lib/types';
import { AnswerCard } from './AnswerCard';

let seq = 0;
const nextId = () => `m${Date.now()}-${seq++}`;

export function Chat({ settings }: { settings: Settings }) {
  const s = t(settings.language);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getCategories()
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories(null));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  async function ask(text: string) {
    const message = text.trim();
    if (message.length < 2 || loading) return;
    setInput('');
    setMessages((m) => [...m.filter((x) => x.role !== 'error'), { id: nextId(), role: 'user', text: message }]);
    setLoading(true);
    try {
      const response = await sendChat(message, settings, conversationId);
      setConversationId(response.conversation_id);
      setMessages((m) => [...m, { id: nextId(), role: 'assistant', response }]);
    } catch (err) {
      setMessages((m) => [...m, { id: nextId(), role: 'error', text: (err as Error).message, retry: message }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function reset() {
    setMessages([]);
    setConversationId(undefined);
    setInput('');
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-3xl flex-col px-4">
      <div className="flex-1 space-y-5 py-8" aria-live="polite">
        {messages.length === 0 && !loading && (
          <section className="pt-6">
            <h1 className="display-tight font-display text-[42px] leading-[1.08] text-bone">{s.emptyTitle}</h1>
            <p className="mt-2 text-[15px] text-fog">{s.emptyBody}</p>
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {s.suggestions.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => ask(q)}
                    className="w-full rounded-card border border-white/10 bg-carbon px-5 py-4 text-left text-sm text-bone transition hover:border-white/30"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
            {categories && (
              <div className="mt-8">
                <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ash">{s.categories}</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <li key={c.id} className="rounded-full border border-white/15 px-3 py-1 text-xs text-fog">
                      {c.label[settings.language]} <span className="text-slate">· {c.documents}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-bone px-4 py-2.5 text-[15px] text-pitch">
                {m.text}
              </p>
            </div>
          ) : m.role === 'assistant' ? (
            <AnswerCard key={m.id} messageId={m.id} response={m.response} />
          ) : (
            <div key={m.id} role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-white/20 bg-carbon p-4 text-sm text-bone">
              <AlertCircle className="size-4" aria-hidden />
              <span className="flex-1">{m.text}</span>
              <button
                type="button"
                onClick={() => {
                  setMessages((all) => all.filter((x) => x.id !== m.id).slice(0, -1));
                  ask(m.retry);
                }}
                className="inline-flex items-center gap-1 rounded-tag bg-bone px-3 py-1.5 font-medium text-pitch"
              >
                <RotateCw className="size-3.5" aria-hidden /> {s.retry}
              </button>
            </div>
          ),
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-ash" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {s.thinking}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 -mx-4 bg-gradient-to-t from-obsidian via-obsidian to-transparent px-4 pb-4 pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-card border border-white/15 bg-carbon p-2 pl-4 transition focus-within:border-white/50">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              title={s.newChat}
              aria-label={s.newChat}
              className="mb-1 rounded-full p-2 text-ash hover:bg-graphite hover:text-bone"
            >
              <MessageSquarePlus className="size-5" aria-hidden />
            </button>
          )}
          <label className="sr-only" htmlFor="q">{s.placeholder}</label>
          <textarea
            id="q"
            ref={inputRef}
            rows={1}
            maxLength={1000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder={s.placeholder}
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[15px] text-bone outline-none placeholder:text-ash"
          />
          <button
            type="submit"
            disabled={loading || input.trim().length < 2}
            aria-label={s.send}
            className="grid size-10 place-items-center rounded-full bg-bone text-pitch transition hover:bg-white disabled:opacity-30"
          >
            <ArrowUp className="size-5" aria-hidden />
          </button>
        </div>
      </form>
    </main>
  );
}
