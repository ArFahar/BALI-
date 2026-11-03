import { ArrowLeft } from 'lucide-react';
import { t } from '../lib/i18n';
import type { Settings } from '../lib/types';
import { ContextForm } from './ContextForm';

/** Standalone context page, reached from the chat header to change settings. */
export function Setup({
  value,
  onChange,
  onBack,
  onDone,
}: {
  value: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const s = t(value.language);
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-10">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-ash hover:text-bone">
        <ArrowLeft className="size-4" aria-hidden /> {s.back}
      </button>
      <h1 className="display-tight mt-6 font-display text-[42px] leading-[1.08] text-bone">{s.setupTitle}</h1>
      <p className="mt-2 text-[15px] text-fog">{s.setupBody}</p>
      <div className="mt-10">
        <ContextForm value={value} onChange={onChange} onSubmit={onDone} />
      </div>
    </main>
  );
}
