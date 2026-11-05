import { useState } from 'react';
import { AlertTriangle, CircleCheck, CircleDashed, CircleSlash, ExternalLink, FileText, Info, ListChecks, Quote, ThumbsDown, ThumbsUp } from 'lucide-react';
import { sendFeedback } from '../lib/api';
import { t, VALIDATION_LABEL } from '../lib/i18n';
import type { ChatResponse } from '../lib/types';
import { SourceBadge } from './SourceBadge';

/* Retrieval status in grayscale: filled = good match, outline = partial, dashed = no grounded answer. */
const STATUS_STYLE: Record<ChatResponse['retrieval_status'], { cls: string; Icon: typeof CircleCheck }> = {
  MATCHED: { cls: 'bg-graphite text-bone', Icon: CircleCheck },
  WEAK_MATCH: { cls: 'border border-fog text-fog', Icon: CircleDashed },
  NO_MATCH: { cls: 'border border-dashed border-slate text-ash', Icon: CircleSlash },
  OUT_OF_SCOPE: { cls: 'border border-dashed border-slate text-ash', Icon: CircleSlash },
  OFF_TOPIC: { cls: 'border border-dashed border-slate text-ash', Icon: CircleSlash },
};

const sectionTitle = 'mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-ash';

export function AnswerCard({ response, messageId }: { response: ChatResponse; messageId: string }) {
  const lang = response.language;
  const s = t(lang);
  const [feedback, setFeedback] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const status = STATUS_STYLE[response.retrieval_status];

  async function rate(rating: 'helpful' | 'not_helpful') {
    setFeedback('sending');
    try {
      await sendFeedback({
        conversation_id: response.conversation_id,
        message_id: messageId,
        rating,
        source_ids: response.sources.map((x) => x.id),
        language: lang,
      });
      setFeedback('sent');
    } catch {
      setFeedback('failed');
    }
  }

  return (
    <article className="rounded-card border border-white/10 bg-carbon p-5 sm:p-6" aria-label={s.guidance}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${status.cls}`}>
          <status.Icon className="size-3.5" aria-hidden />
          {s.status[response.retrieval_status]}
        </span>
        {response.source_classification.map((type) => (
          <SourceBadge key={type} type={type} lang={lang} />
        ))}
        <span className="text-[11px] text-slate">{s.generatedBy[response.generation_mode]}</span>
      </div>

      {/* A. Guidance */}
      <section>
        <h3 className="sr-only">{s.guidance}</h3>
        <p className="text-[16px] leading-relaxed text-bone">{response.answer}</p>
      </section>

      {/* A2. Verbatim source text, always in its original language (never machine-translated) */}
      {response.quote && (
        <figure className="mt-4 rounded-2xl border border-white/10 bg-obsidian/60 p-4">
          <figcaption className={`${sectionTitle} mb-2`}>
            <Quote className="size-3.5" aria-hidden /> {s.quoteTitle} · {s.quoteLang[response.quote.language]}
          </figcaption>
          <blockquote lang={response.quote.language} className="whitespace-pre-line border-l-2 border-fog/40 pl-3 text-sm leading-relaxed text-mist">
            {response.quote.text}
          </blockquote>
        </figure>
      )}

      {/* B. Why it matters */}
      {response.why_it_matters && (
        <section className="mt-5">
          <h3 className={sectionTitle}>
            <Info className="size-3.5" aria-hidden /> {s.why}
          </h3>
          <p className="text-sm leading-relaxed text-fog">{response.why_it_matters}</p>
        </section>
      )}

      {/* C. Recommended actions */}
      {response.recommended_actions.length > 0 && (
        <section className="mt-5">
          <h3 className={sectionTitle}>
            <ListChecks className="size-3.5" aria-hidden /> {s.actions}
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-fog marker:text-slate">
            {response.recommended_actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Caveats: verification status, applicability, scope */}
      {response.caveats.length > 0 && (
        <section className="mt-5 rounded-2xl border border-white/10 bg-graphite/60 p-4">
          <h3 className={`${sectionTitle} text-bone`}>
            <AlertTriangle className="size-3.5" aria-hidden /> {s.notes}
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-fog">
            {response.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {/* D + E. Sources with classification */}
      <section className="mt-5 border-t border-white/10 pt-4">
        <h3 className={sectionTitle}>
          <FileText className="size-3.5" aria-hidden /> {s.sources}
        </h3>
        {response.sources.length === 0 ? (
          <p className="text-sm text-ash">{s.noSources}</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {response.sources.map((src) => (
              <li key={src.id} className="rounded-2xl border border-white/10 bg-obsidian/60 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <SourceBadge type={src.source_type} lang={lang} />
                  <span className="rounded-full bg-graphite px-2 py-0.5 text-[11px] text-fog">
                    {VALIDATION_LABEL[src.validation_status][lang]}
                  </span>
                  {src.is_demo_data && (
                    <span className="rounded-full border border-dashed border-fog px-2 py-0.5 text-[11px] font-medium text-fog">
                      {s.demo}
                    </span>
                  )}
                  {src.flags
                    .filter((f) => s.flagLabels[f])
                    .map((f) => (
                      <span key={f} className="rounded-full border border-dashed border-fog/70 px-2 py-0.5 text-[11px] text-fog">
                        {s.flagLabels[f]}
                      </span>
                    ))}
                </div>
                <p className="mt-2 font-medium text-bone">{src.document_title}</p>
                <p className="text-fog">
                  {[src.articles.join(', '), src.page_number != null ? s.page(src.page_number, src.page_ref_type === 'original_scan_page') : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="mt-1 text-xs text-slate">
                  {src.id} · {Math.round(src.relevance * 100)}% {s.relevance}
                  {src.effective_date ? ` · ${s.effective} ${src.effective_date}` : ''}
                </p>
                {src.source_url && (
                  <a
                    href={src.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-bone underline-offset-2 hover:underline"
                  >
                    {s.open} <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* P1: feedback */}
      <footer className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ash">
        {feedback === 'sent' ? (
          <span role="status">{s.thanks}</span>
        ) : (
          <>
            <span>{s.helpful}</span>
            {(['helpful', 'not_helpful'] as const).map((r) => (
              <button
                key={r}
                type="button"
                disabled={feedback === 'sending'}
                onClick={() => rate(r)}
                className="inline-flex items-center gap-1 rounded-tag border border-white/15 px-2.5 py-1 text-fog hover:bg-graphite hover:text-bone disabled:opacity-50"
              >
                {r === 'helpful' ? <ThumbsUp className="size-3.5" aria-hidden /> : <ThumbsDown className="size-3.5" aria-hidden />}
                {r === 'helpful' ? s.yes : s.no}
              </button>
            ))}
            {feedback === 'failed' && <span role="alert" className="text-bone">{s.feedbackFailed}</span>}
          </>
        )}
      </footer>
    </article>
  );
}
