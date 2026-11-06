import { ArrowRight, Backpack, Home, MapPin } from 'lucide-react';
import { t } from '../lib/i18n';
import type { Language, Settings, UserType } from '../lib/types';

export function ContextForm({
  value,
  onChange,
  onSubmit,
  variant = 'solid',
}: {
  value: Settings;
  onChange: (s: Settings) => void;
  onSubmit: () => void;
  variant?: 'solid' | 'glass';
}) {
  const s = t(value.language);
  const glass = variant === 'glass';

  const userTypes: { id: UserType; label: string; hint: string; Icon: typeof Backpack }[] = [
    { id: 'tourist', label: s.tourist, hint: s.touristHint, Icon: Backpack },
    { id: 'newcomer', label: s.newcomer, hint: s.newcomerHint, Icon: Home },
  ];

  const surface = glass ? 'bg-white/[0.04]' : 'bg-carbon';
  const option = (active: boolean) =>
    `flex w-full items-start gap-3 rounded-card border p-4 text-left transition ${
      active ? 'border-bone bg-graphite/80' : `border-white/10 ${surface} hover:border-white/30`
    }`;
  const legend = 'mb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-ash';

  return (
    <form
      className={glass ? 'space-y-6 rounded-card border border-white/15 bg-black/60 p-5 backdrop-blur-md sm:p-6' : 'space-y-8'}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <fieldset>
        <legend className={legend}>{s.youAre}</legend>
        <div className={`grid gap-3 ${glass ? "lg:grid-cols-2" : "sm:grid-cols-2"}`} role="radiogroup">
          {userTypes.map(({ id, label, hint, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={value.userType === id}
              onClick={() => onChange({ ...value, userType: id })}
              className={option(value.userType === id)}
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-bone" aria-hidden />
              <span>
                <span className="block font-medium text-bone">{label}</span>
                <span className="block text-sm text-ash">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={legend}>{s.location}</legend>
        <label className="relative block">
          <MapPin className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-fog" aria-hidden />
          <select
            value={value.location}
            onChange={() => onChange({ ...value, location: 'canggu' })}
            className={`w-full appearance-none rounded-card border border-white/10 ${surface} py-3 pl-10 pr-4 text-bone`}
            aria-describedby={`loc-hint-${variant}`}
          >
            <option value="canggu">{s.canggu}</option>
          </select>
        </label>
        <p id={`loc-hint-${variant}`} className="mt-2 text-sm text-ash">{s.moreLocations}</p>
      </fieldset>

      <fieldset>
        <legend className={legend}>{s.language}</legend>
        <div className={`inline-flex rounded-full border border-white/15 ${surface} p-1`} role="radiogroup">
          {(['en', 'id'] as Language[]).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={value.language === l}
              onClick={() => onChange({ ...value, language: l })}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                value.language === l ? 'bg-bone text-pitch' : 'text-fog hover:text-bone'
              }`}
            >
              {l === 'en' ? 'English' : 'Bahasa Indonesia'}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-bone px-6 py-3 font-medium text-pitch transition hover:bg-white sm:w-auto"
      >
        {s.continue} <ArrowRight className="size-4" aria-hidden />
      </button>
    </form>
  );
}
