import { ArrowDown } from 'lucide-react';
import { t } from '../lib/i18n';
import type { Settings } from '../lib/types';
import { ContextForm } from './ContextForm';
import { SourceLegend } from './SourceBadge';

export function Landing({
  settings,
  onChange,
  onStart,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onStart: () => void;
}) {
  const lang = settings.language;
  const s = t(lang);

  return (
    <main>
      {/* Hero — the painting is the only colour on the page; the context form lives inside it */}
      <section className="relative isolate overflow-hidden px-4 pb-16 pt-28 md:flex md:min-h-[100svh] md:items-center">
        <img
          src="/hero-pura.webp"
          alt={s.heroAlt}
          fetchPriority="high"
          className="absolute inset-0 -z-20 size-full object-cover object-[32%_50%]"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/55 via-black/30 to-black" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/50 via-transparent to-black/40" />

        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 md:grid-cols-[1fr_1fr] md:gap-10 lg:gap-14">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-bone/75">{s.heroLabel}</p>
            <h1 className="display-tight mt-5 font-display text-[44px] leading-[1.02] text-bone md:text-[52px] lg:text-[72px]">
              {s.heroTitle[0]} <em className="italic">{s.heroTitle[1]}</em> {s.heroTitle[2]}
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-bone/85">
              {s.heroTagline[0]}
              <br />
              {s.heroTagline[1]}
            </p>
            <a
              href="#how"
              className="mt-8 hidden items-center gap-2 text-sm font-medium text-bone/80 underline-offset-4 hover:text-bone hover:underline md:inline-flex"
            >
              {s.howTitle} <ArrowDown className="size-4" aria-hidden />
            </a>
          </div>

          <div>
            <h2 className="display-tight mb-1 font-display text-[32px] leading-tight text-bone">
              {s.setupTitle}
            </h2>
            <p className="mb-5 text-sm text-fog">{s.setupBody}</p>
            <ContextForm value={settings} onChange={onChange} onSubmit={onStart} variant="glass" />
          </div>
        </div>
      </section>

      {/* Editorial sections on the black canvas */}
      <div className="mx-auto max-w-5xl px-4 pb-20">
        <section aria-labelledby="how" className="grid scroll-mt-20 gap-6 pt-8 md:grid-cols-[1.1fr_1fr] md:items-end">
          <h2 id="how" className="display-tight scroll-mt-24 font-display text-[42px] leading-[1.08] text-bone">
            {s.howHeading[0]} <em className="italic">{s.howHeading[1]}</em> {s.howHeading[2]}
          </h2>
          <p className="text-[15px] leading-relaxed text-fog">{s.heroBody}</p>
        </section>

        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {s.how.map(([title, body], i) => (
            <li key={title} className="rounded-card border border-white/10 bg-carbon p-6">
              <span className="text-[30px] font-semibold leading-none text-slate">0{i + 1}</span>
              <h3 className="mt-6 text-[20px] font-semibold leading-tight tracking-[-0.017em] text-bone">{title}</h3>
              {body && <p className="mt-2 text-sm leading-relaxed text-fog">{body}</p>}
            </li>
          ))}
        </ol>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <section aria-labelledby="legend" className="rounded-card border border-white/10 bg-carbon p-6">
            <h2 id="legend" className="text-[11px] font-medium uppercase tracking-[0.16em] text-ash">{s.legendTitle}</h2>
            <div className="mt-4">
              <SourceLegend lang={lang} />
            </div>
          </section>
          <section aria-labelledby="honesty" className="rounded-card border border-white/10 bg-carbon p-6">
            <h2 id="honesty" className="text-[11px] font-medium uppercase tracking-[0.16em] text-ash">{s.honestyTitle}</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fog">{s.honesty}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
