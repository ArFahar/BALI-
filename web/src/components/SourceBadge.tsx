import { BookOpenCheck, Landmark, Lightbulb, Users } from 'lucide-react';
import { SOURCE_TYPE_LABEL } from '../lib/i18n';
import type { Language, SourceType } from '../lib/types';

/*
 * Monochrome by design: source types are told apart by fill weight, border style and icon,
 * never by hue. Strongest visual weight = official regulation; dashed = general advice.
 */
const STYLE: Record<SourceType, { cls: string; Icon: typeof Landmark }> = {
  OFFICIAL_REGULATION: { cls: 'bg-bone text-pitch border border-bone', Icon: Landmark },
  COMMUNITY_VERIFIED: { cls: 'border border-bone text-bone', Icon: Users },
  GENERAL_ADVISORY: { cls: 'border border-dashed border-fog text-fog', Icon: Lightbulb },
};

export function SourceBadge({ type, lang }: { type: SourceType; lang: Language }) {
  const { cls, Icon } = STYLE[type];
  const { label, hint } = SOURCE_TYPE_LABEL[type][lang];
  return (
    <span title={hint} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

export function SourceLegend({ lang }: { lang: Language }) {
  return (
    <ul className="space-y-3 text-sm text-fog">
      {(Object.keys(SOURCE_TYPE_LABEL) as SourceType[]).map((type) => (
        <li key={type} className="flex flex-wrap items-center gap-2">
          <SourceBadge type={type} lang={lang} />
          <span>{SOURCE_TYPE_LABEL[type][lang].hint}</span>
        </li>
      ))}
      <li className="flex items-center gap-2 text-ash">
        <BookOpenCheck className="size-4 shrink-0" aria-hidden />
        {lang === 'en'
          ? 'Each source also shows whether it has been verified by a local reviewer.'
          : 'Setiap sumber juga menunjukkan apakah sudah diverifikasi oleh peninjau lokal.'}
      </li>
    </ul>
  );
}
